# deploy.sh uploads each release here, and the server downloads it from here
# (docs/setup.md, "Deploy the app"). Everything in it can be built again from
# the repo, so tearing the server down deletes it, objects and all.
resource "aws_s3_bucket" "releases" {
  bucket        = local.release_bucket
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "releases" {
  bucket = aws_s3_bucket.releases.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# A release is installed within a minute of its upload, so older ones are only
# clutter.
resource "aws_s3_bucket_lifecycle_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id

  rule {
    id     = "expire-releases"
    status = "Enabled"

    filter {
      prefix = "releases/"
    }

    expiration {
      days = 30
    }
  }
}
