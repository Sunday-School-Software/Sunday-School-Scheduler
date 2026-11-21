# The hosted zone isn't created here: registering a domain with Route 53
# creates one, and it stays when the server is torn down.
data "aws_route53_zone" "app" {
  name         = var.hosted_zone
  private_zone = false
}

# Points the app's domain at the Elastic IP, which stays the same when the
# instance is rebuilt, so the record rarely changes.
resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}
