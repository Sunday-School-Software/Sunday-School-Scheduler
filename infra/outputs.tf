output "instance_id" {
  description = "The instance's ID, for `aws ssm start-session --target`."
  value       = aws_instance.server.id
}

output "public_ip" {
  description = "The Elastic IP. The domain's DNS record points here (#43)."
  value       = aws_eip.server.public_ip
}

output "role_name" {
  description = "The instance's IAM role."
  value       = aws_iam_role.server.name
}
