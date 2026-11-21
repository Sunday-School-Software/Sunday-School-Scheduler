# The instance's role is the only thing that can call AWS for the app, so no
# AWS keys live in the code or on the instance (design §4). The policies use
# jsonencode() rather than aws_iam_policy_document so the tests can read them.

resource "aws_iam_role" "server" {
  name = local.name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Item reads and writes on the app's table and its indexes. No Scan, and no
# table changes such as DeleteTable.
resource "aws_iam_role_policy" "table" {
  name = "table"
  role = aws_iam_role.server.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:ConditionCheckItem",
      ]
      Resource = [local.table_arn, "${local.table_arn}/index/*"]
    }]
  })
}

# The minimum Session Manager needs for a shell, so port 22 stays closed. Not
# the AmazonSSMManagedInstanceCore managed policy, which would also let the
# server read every Parameter Store value in the account.
resource "aws_iam_role_policy" "session_manager" {
  name = "session-manager"
  role = aws_iam_role.server.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssm:UpdateInstanceInformation",
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      # These actions can't be limited to one resource.
      Resource = "*"
    }]
  })
}

# deploy.sh installs a release with Run Command, which reaches the instance's
# agent through these message actions. Like Session Manager's, they can't be
# limited to one resource, and they only fetch and answer commands sent to
# this instance.
resource "aws_iam_role_policy" "run_command" {
  name = "run-command"
  role = aws_iam_role.server.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ec2messages:AcknowledgeMessage",
        "ec2messages:DeleteMessage",
        "ec2messages:FailMessage",
        "ec2messages:GetEndpoint",
        "ec2messages:GetMessages",
        "ec2messages:SendReply",
      ]
      Resource = "*"
    }]
  })
}

# Downloads a release that deploy.sh uploaded. Read only, and only releases:
# the server can't change what it runs.
resource "aws_iam_role_policy" "releases" {
  name = "releases"
  role = aws_iam_role.server.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = "arn:aws:s3:::${local.release_bucket}/releases/*"
    }]
  })
}

# The role has only the policies above. An apply removes any managed or inline
# policy added to it some other way, such as in the console.
resource "aws_iam_role_policy_attachments_exclusive" "server" {
  role_name   = aws_iam_role.server.name
  policy_arns = []
}

resource "aws_iam_role_policies_exclusive" "server" {
  role_name = aws_iam_role.server.name
  policy_names = [
    aws_iam_role_policy.table.name,
    aws_iam_role_policy.session_manager.name,
    aws_iam_role_policy.run_command.name,
    aws_iam_role_policy.releases.name,
  ]
}

resource "aws_iam_instance_profile" "server" {
  name = local.name
  role = aws_iam_role.server.name
}
