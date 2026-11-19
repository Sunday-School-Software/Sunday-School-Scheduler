data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "server" {
  name        = local.name
  description = "Sunday School Scheduler server: HTTP and HTTPS in, anything out"
  vpc_id      = data.aws_vpc.default.id
}

# Caddy (#43) answers on 80 for certificates and the redirect, and on 443 for
# the app. There's no rule for 22: shell access goes through Session Manager.
resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each = { http = 80, https = 443 }

  security_group_id = aws_security_group.server.id
  description       = upper(each.key)
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
}

# Terraform removes the allow-all outbound rule AWS adds to a new security
# group. Without this one, the instance can't install Node, reach DynamoDB or
# connect to Session Manager.
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.server.id
  description       = "Anything out"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.al2023.insecure_value
  instance_type          = "t3.micro" # free tier on both AWS plans (design §2)
  iam_instance_profile   = aws_iam_instance_profile.server.name
  vpc_security_group_ids = [aws_security_group.server.id]

  # cloud-init runs user data only on first boot, so a change to the script
  # needs a new instance to take effect. The instance holds no data.
  user_data                   = file("${path.module}/user-data.sh")
  user_data_replace_on_change = true

  # IMDSv2 only, so a request forged through the app can't read the role's
  # credentials.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    encrypted = true
  }

  tags = {
    Name = local.name
  }

  # A new AMI would otherwise replace the instance on the next apply, whatever
  # else changed. Move to it on purpose with `terraform apply -replace`.
  lifecycle {
    ignore_changes = [ami]
  }
}

# Stopped, the instance isn't billed for compute, but it keeps its disk,
# Elastic IP and certificate, so starting it again takes about a minute.
resource "aws_ec2_instance_state" "server" {
  instance_id = aws_instance.server.id
  state       = var.running ? "running" : "stopped"
}

# The domain's DNS record (#43) points here, and the address stays the same
# when the instance is rebuilt. Once released, the address is gone for good.
resource "aws_eip" "server" {
  domain = "vpc"

  tags = {
    Name = local.name
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}
