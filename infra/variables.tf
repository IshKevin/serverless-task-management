variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "env" {
  type    = string
  default = "dev"
}

variable "allowed_domains" {
  type    = list(string)
  default = ["amalitech.com", "amalitechtraining.org"]
}

variable "ses_from_email" {
  type        = string
  description = "SES verified sender email address for notifications"
}
