variable "domain" {
  description = "The app's domain, such as scheduler.example.org. Caddy gets an HTTPS certificate for it, and a DNS record in hosted_zone points it at the server."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.domain))
    error_message = "Set domain to a lowercase domain name such as scheduler.example.org, without https:// or a trailing dot."
  }
}

variable "hosted_zone" {
  description = "The Route 53 public hosted zone the domain is in, such as example.org. Registering the domain with Route 53 creates it."
  type        = string

  validation {
    condition     = var.domain == var.hosted_zone || endswith(var.domain, ".${var.hosted_zone}")
    error_message = "Set hosted_zone to the zone domain is in: example.org for scheduler.example.org or for example.org itself."
  }
}

variable "region" {
  description = "The AWS region the table is in, such as us-east-1. The server is created there too."
  type        = string

  validation {
    condition     = trimspace(var.region) != ""
    error_message = "Set region to the table's region, such as us-east-1."
  }
}

variable "running" {
  description = "true keeps the instance running; false stops it, so its compute isn't billed. Set it in terraform.tfvars, so a later apply doesn't flip it back."
  type        = bool
}

variable "table_name" {
  description = "The DynamoDB table the API uses, such as sunday-school-prod. The server's resources are named after it."
  type        = string

  # No default, so an apply can't point the server at the wrong environment's table.
  validation {
    condition     = trimspace(var.table_name) != ""
    error_message = "Set table_name to the table's name, such as sunday-school-prod."
  }
}
