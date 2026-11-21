# Checks the server's network rules and its role's permissions (what issue
# #42's acceptance criteria limit), the switch that stops it, the domain's DNS
# record and Caddy setup (#43), its SES identity (#99), and the release bucket
# and API settings that deploy.sh uses (#44). Runs against a fake AWS provider: no
# credentials, and nothing is created. Run from infra/:
#   terraform init -backend=false
#   terraform test
# Each run is a plan, not an apply: the Elastic IP's prevent_destroy would stop
# the test from cleaning up after an apply.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_ssm_parameter" {
    defaults = { insecure_value = "ami-0123456789abcdef0" }
  }
  mock_data "aws_route53_zone" {
    defaults = { zone_id = "Z0123456789EXAMPLE" }
  }
}

# The Elastic IP's address is only known after an apply, so give it one here.
override_resource {
  target          = aws_eip.server
  override_during = plan
  values          = { public_ip = "203.0.113.10" }
}

# SES makes the identity's ARN and DKIM tokens when it's created.
override_resource {
  target          = aws_sesv2_email_identity.app
  override_during = plan
  values = {
    arn                     = "arn:aws:ses:us-east-1:123456789012:identity/scheduler.example.org"
    dkim_signing_attributes = { tokens = ["token1", "token2", "token3"] }
  }
}

variables {
  cognito_client_id    = "1example23456789abcdefghij"
  cognito_user_pool_id = "us-east-1_AbCdEf123"
  domain               = "scheduler.example.org"
  hosted_zone          = "example.org"
  region               = "us-east-1"
  running              = true
  table_name           = "sunday-school-test"
}

run "dns" {
  command = plan

  assert {
    condition     = aws_route53_record.app.zone_id == "Z0123456789EXAMPLE" && aws_route53_record.app.name == "scheduler.example.org"
    error_message = "The DNS record should be the domain, in its hosted zone."
  }
  assert {
    condition     = aws_route53_record.app.type == "A" && aws_route53_record.app.records == toset(["203.0.113.10"])
    error_message = "The domain should point at the Elastic IP."
  }
  assert {
    condition     = output.url == "https://scheduler.example.org"
    error_message = "The url output should be the domain over HTTPS."
  }
}

run "caddy" {
  command = plan

  assert {
    condition     = strcontains(aws_instance.server.user_data, file("Caddyfile"))
    error_message = "The user data should install the repository's Caddyfile unchanged."
  }
  assert {
    condition     = strcontains(aws_instance.server.user_data, "Environment=DOMAIN=scheduler.example.org\n")
    error_message = "Caddy should be told the domain."
  }
}

run "email" {
  command = plan

  assert {
    condition     = aws_sesv2_email_identity.app.email_identity == "scheduler.example.org"
    error_message = "The SES identity should be the app's domain."
  }
  assert {
    condition     = alltrue([for record in aws_route53_record.dkim : record.zone_id == "Z0123456789EXAMPLE" && record.type == "CNAME"])
    error_message = "The DKIM records should be CNAMEs in the domain's hosted zone."
  }
  assert {
    condition = [for record in aws_route53_record.dkim : [record.name, record.records]] == [
      ["token1._domainkey.scheduler.example.org", toset(["token1.dkim.amazonses.com"])],
      ["token2._domainkey.scheduler.example.org", toset(["token2.dkim.amazonses.com"])],
      ["token3._domainkey.scheduler.example.org", toset(["token3.dkim.amazonses.com"])],
    ]
    error_message = "Each DKIM token should get a record pointing at SES's key for it."
  }
}

run "domain_outside_zone" {
  command = plan

  variables {
    domain = "scheduler.example.com"
  }

  expect_failures = [var.hosted_zone]
}

run "domain_with_scheme" {
  command = plan

  variables {
    domain = "https://scheduler.example.org"
  }

  expect_failures = [var.domain]
}

run "domain_is_zone" {
  command = plan

  variables {
    domain = "example.org"
  }

  assert {
    condition     = aws_route53_record.app.name == "example.org"
    error_message = "The domain can be the hosted zone itself."
  }
}

run "network" {
  command = plan

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.web) == 2
    error_message = "The server should have exactly two inbound rules."
  }
  assert {
    condition     = toset([for rule in aws_vpc_security_group_ingress_rule.web : rule.from_port]) == toset([80, 443])
    error_message = "Inbound rules should open only ports 80 and 443."
  }
  assert {
    condition = alltrue([
      for rule in aws_vpc_security_group_ingress_rule.web :
      rule.to_port == rule.from_port && rule.ip_protocol == "tcp" && rule.cidr_ipv4 == "0.0.0.0/0"
    ])
    error_message = "Each inbound rule should open one TCP port to the world."
  }
  assert {
    condition     = aws_vpc_security_group_egress_rule.all.ip_protocol == "-1" && aws_vpc_security_group_egress_rule.all.cidr_ipv4 == "0.0.0.0/0"
    error_message = "The server needs an allow-all outbound rule, or it can't install Node or reach DynamoDB."
  }
}

run "running" {
  command = plan

  assert {
    condition     = aws_ec2_instance_state.server.state == "running"
    error_message = "running = true should keep the instance running."
  }
}

run "stopped" {
  command = plan

  variables {
    running = false
  }

  assert {
    condition     = aws_ec2_instance_state.server.state == "stopped"
    error_message = "running = false should stop the instance."
  }
}

run "role" {
  command = plan

  assert {
    condition = jsondecode(aws_iam_role.server.assume_role_policy).Statement == [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
    error_message = "Only EC2 should be able to take on the server's role."
  }

  assert {
    condition = toset(jsondecode(aws_iam_role_policy.table.policy).Statement[0].Action) == toset([
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:ConditionCheckItem",
    ])
    error_message = "The table policy should allow only item reads and writes (no Scan, no table changes)."
  }
  assert {
    condition = toset(jsondecode(aws_iam_role_policy.table.policy).Statement[0].Resource) == toset([
      "arn:aws:dynamodb:us-east-1:123456789012:table/sunday-school-test",
      "arn:aws:dynamodb:us-east-1:123456789012:table/sunday-school-test/index/*",
    ])
    error_message = "The table policy should cover only the app's table and its indexes."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.table.policy).Statement) == 1
    error_message = "The table policy should have only the one statement."
  }

  assert {
    condition = toset(jsondecode(aws_iam_role_policy.session_manager.policy).Statement[0].Action) == toset([
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ])
    error_message = "The Session Manager policy should allow only the five actions a shell needs."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.session_manager.policy).Statement) == 1
    error_message = "The Session Manager policy should have only the one statement."
  }

  assert {
    condition = toset(jsondecode(aws_iam_role_policy.run_command.policy).Statement[0].Action) == toset([
      "ec2messages:AcknowledgeMessage",
      "ec2messages:DeleteMessage",
      "ec2messages:FailMessage",
      "ec2messages:GetEndpoint",
      "ec2messages:GetMessages",
      "ec2messages:SendReply",
    ])
    error_message = "The Run Command policy should allow only the six message actions."
  }
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.run_command.policy).Statement) == 1
    error_message = "The Run Command policy should have only the one statement."
  }

  assert {
    condition = jsondecode(aws_iam_role_policy.releases.policy).Statement == [{
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = "arn:aws:s3:::sunday-school-test-server-releases-123456789012/releases/*"
    }]
    error_message = "The releases policy should allow only reading releases from the release bucket."
  }

  assert {
    condition = jsondecode(aws_iam_role_policy.email.policy).Statement == [{
      Effect   = "Allow"
      Action   = "ses:SendEmail"
      Resource = "arn:aws:ses:us-east-1:123456789012:identity/scheduler.example.org"
    }]
    error_message = "The email policy should allow only sending email from the app's domain."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachments_exclusive.server.policy_arns) == 0
    error_message = "The role should have no managed policies."
  }
  assert {
    condition     = toset(aws_iam_role_policies_exclusive.server.policy_names) == toset(["table", "session-manager", "run-command", "releases", "email"])
    error_message = "The role should have only the table, Session Manager, Run Command, releases and email policies."
  }
}

run "releases" {
  command = plan

  assert {
    condition     = aws_s3_bucket.releases.bucket == "sunday-school-test-server-releases-123456789012"
    error_message = "The release bucket should be named after the server and the account."
  }
  assert {
    condition     = output.release_bucket == aws_s3_bucket.releases.bucket && output.region == "us-east-1"
    error_message = "deploy.sh needs the bucket and the region as outputs."
  }
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.releases.block_public_acls,
      aws_s3_bucket_public_access_block.releases.block_public_policy,
      aws_s3_bucket_public_access_block.releases.ignore_public_acls,
      aws_s3_bucket_public_access_block.releases.restrict_public_buckets,
    ])
    error_message = "The release bucket should block all public access."
  }
  assert {
    condition = (
      aws_s3_bucket_lifecycle_configuration.releases.rule[0].filter[0].prefix == "releases/" &&
      aws_s3_bucket_lifecycle_configuration.releases.rule[0].expiration[0].days == 30
    )
    error_message = "Releases should expire after 30 days."
  }
}

run "api_env" {
  command = plan

  assert {
    condition     = output.api_env == <<-EOT
      AWS_REGION=us-east-1
      COGNITO_CLIENT_ID=1example23456789abcdefghij
      COGNITO_USER_POOL_ID=us-east-1_AbCdEf123
      DYNAMODB_TABLE=sunday-school-test
      NODE_ENV=production
      PORT=3000
    EOT
    error_message = "The API's settings should be the table, pool and region from the variables, on port 3000 (the Caddyfile's)."
  }
}

run "user_pool_in_other_region" {
  command = plan

  variables {
    cognito_user_pool_id = "us-west-2_AbCdEf123"
  }

  expect_failures = [var.cognito_user_pool_id]
}

run "user_pool_id_malformed" {
  command = plan

  variables {
    cognito_user_pool_id = "us-east-1_Ab Cd"
  }

  expect_failures = [var.cognito_user_pool_id]
}

run "client_id_malformed" {
  command = plan

  variables {
    cognito_client_id = "COGNITO_CLIENT_ID=abc"
  }

  expect_failures = [var.cognito_client_id]
}
