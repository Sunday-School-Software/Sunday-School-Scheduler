# Checks the server's network rules and its role's permissions, the two things
# issue #42's acceptance criteria limit. Runs against a fake AWS provider: no
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
}

variables {
  region     = "us-east-1"
  table_name = "sunday-school-test"
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
    condition     = length(aws_iam_role_policy_attachments_exclusive.server.policy_arns) == 0
    error_message = "The role should have no managed policies."
  }
  assert {
    condition     = toset(aws_iam_role_policies_exclusive.server.policy_names) == toset(["table", "session-manager"])
    error_message = "The role should have only the table and Session Manager policies."
  }
}
