# The EC2 instance the app runs on, its IAM role, security group, Elastic IP
# and DNS record, and the domain's SES identity for sending email.
# docs/setup.md ("Create the server") explains how to run this.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State lives in an S3 bucket, so the server can be rebuilt from any machine.
  # The bucket's name isn't in this public repo: pass it to `terraform init`
  # with -backend-config. use_lockfile stops two applies running at once.
  backend "s3" {
    key          = "server/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
}

# The region is a variable, not the shell's AWS_REGION, so an apply from a
# shell set to another region can't build a second server there or point the
# role at a table that isn't there.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = "sunday-school-scheduler"
    }
  }
}

data "aws_caller_identity" "current" {}

# AWS's public parameter for the newest Amazon Linux 2023 AMI (x86).
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

locals {
  name      = "${var.table_name}-server"
  table_arn = "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/${var.table_name}"
}
