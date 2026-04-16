variable "aws_region" {
  type = string
  default = "eu-west-1"
}

variable "env" {
  type = string
  default = "dev"
}

variable "allowed_domains" {
  type = list(string)
  default = ["amalitech.com", "amalitechtraining.org"]
}

variable "jenkins_key_name" {
  type = string
  description = "EC2 key pair for SSH to Jenkins"
}

variable "admin_cidr_blocks" {
  type = list(string)
  description = "Your IP ranges for accessing Jenkins UI and SSH"
  default = ["0.0.0.0/0"] # Lock this down in real use
}