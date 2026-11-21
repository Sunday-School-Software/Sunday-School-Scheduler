output "api_env" {
  description = "The API's settings, one NAME=value per line. deploy.sh installs them on the server."
  value       = join("", [for name, value in local.api_env : "${name}=${value}\n"])
}

output "instance_id" {
  description = "The instance's ID, for `aws ssm start-session --target`."
  value       = aws_instance.server.id
}

output "public_ip" {
  description = "The Elastic IP. The domain's DNS record points here."
  value       = aws_eip.server.public_ip
}

output "region" {
  description = "The region the server, its table and its bucket are in."
  value       = var.region
}

output "release_bucket" {
  description = "The S3 bucket deploy.sh uploads releases to."
  value       = aws_s3_bucket.releases.bucket
}

output "role_name" {
  description = "The instance's IAM role."
  value       = aws_iam_role.server.name
}

output "url" {
  description = "The app's address."
  value       = "https://${var.domain}"
}
