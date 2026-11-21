# The app sends email from its own domain through SES. SES treats the domain as
# verified once the DKIM records below resolve, and signs every email with the
# domain's DKIM key, so mail servers can tell it really came from the app.
resource "aws_sesv2_email_identity" "app" {
  email_identity = var.domain

  # Easy DKIM: SES makes the key and rotates it.
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Easy DKIM always gives three tokens. Their values aren't known until SES
# creates the identity, so a for_each over them couldn't be planned.
resource "aws_route53_record" "dkim" {
  count = 3

  zone_id = data.aws_route53_zone.app.zone_id
  name    = "${aws_sesv2_email_identity.app.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.app.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}
