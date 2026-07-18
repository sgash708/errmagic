# Minimal Terraform for the errmagic replay bucket.
# The ingest API needs s3:PutObject; developers issue presigned GET URLs
# (`aws s3 presign`) to feed viewer/index.html.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket that stores replay .json.gz objects"
}

variable "replay_retention_days" {
  type        = number
  description = "Days to keep replays before automatic deletion"
  default     = 30
}

resource "aws_s3_bucket" "replay" {
  bucket = var.bucket_name
}

# Replays may contain user behavior — keep the bucket fully private.
resource "aws_s3_bucket_public_access_block" "replay" {
  bucket                  = aws_s3_bucket.replay.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "replay" {
  bucket = aws_s3_bucket.replay.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "replay" {
  bucket = aws_s3_bucket.replay.id
  rule {
    id     = "expire-replays"
    status = "Enabled"
    expiration {
      days = var.replay_retention_days
    }
  }
}

# Attach this policy to the role your ingest API runs as.
data "aws_iam_policy_document" "put_replay" {
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.replay.arn}/*"]
  }
}

resource "aws_iam_policy" "put_replay" {
  name   = "${var.bucket_name}-put-replay"
  policy = data.aws_iam_policy_document.put_replay.json
}

output "bucket_name" {
  value = aws_s3_bucket.replay.bucket
}

output "put_replay_policy_arn" {
  value = aws_iam_policy.put_replay.arn
}
