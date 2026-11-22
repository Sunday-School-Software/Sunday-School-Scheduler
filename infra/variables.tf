variable "cognito_client_id" {
  description = "The production user pool's app client ID. `npm run cognito:create` prints it as COGNITO_CLIENT_ID."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]+$", var.cognito_client_id))
    error_message = "Set cognito_client_id to the COGNITO_CLIENT_ID that `npm run cognito:create` printed for the production pool."
  }
}

variable "cognito_user_pool_id" {
  description = "The production user pool's ID, such as us-east-1_AbCdEf123. `npm run cognito:create` prints it as COGNITO_USER_POOL_ID."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+_[A-Za-z0-9]+$", var.cognito_user_pool_id))
    error_message = "Set cognito_user_pool_id to the COGNITO_USER_POOL_ID that `npm run cognito:create` printed for the production pool, such as us-east-1_AbCdEf123."
  }

  # The API calls Cognito in the server's region (AWS_REGION), so a pool in
  # another region would fail every sign-in.
  validation {
    condition     = startswith(var.cognito_user_pool_id, "${var.region}_")
    error_message = "The user pool must be in region: its ID starts with the region, such as us-east-1_."
  }
}

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
