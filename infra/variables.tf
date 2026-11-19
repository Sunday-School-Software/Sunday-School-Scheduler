variable "region" {
  description = "The AWS region the table is in, such as us-east-1. The server is created there too."
  type        = string

  validation {
    condition     = trimspace(var.region) != ""
    error_message = "Set region to the table's region, such as us-east-1."
  }
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
