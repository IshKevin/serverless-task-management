data "aws_ami" "ubuntu" {
  most_recent = true
  owners = ["099720109477"] # Canonical
  filter {
    name = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_security_group" "jenkins" {
  name = "jenkins-sg-${var.env}"
  description = "Allow 8080 and 22"

  ingress {
    from_port = 22
    to_port = 22
    protocol = "tcp"
    cidr_blocks = var.admin_cidr_blocks
  }

  ingress {
    from_port = 8080
    to_port = 8080
    protocol = "tcp"
    cidr_blocks = var.admin_cidr_blocks
  }

  egress {
    from_port = 0
    to_port = 0
    protocol = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role" "jenkins" {
  name = "jenkins-ec2-role-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "jenkins_deploy" {
  name = "jenkins-deploy"
  role = aws_iam_role.jenkins.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "s3:*",
          "cloudfront:CreateInvalidation",
          "cognito-idp:*",
          "dynamodb:*",
          "apigateway:*"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "jenkins" {
  name = "jenkins-profile-${var.env}"
  role = aws_iam_role.jenkins.name
}

resource "aws_instance" "jenkins" {
  ami = data.aws_ami.ubuntu.id
  instance_type = "t3.medium"
  key_name = var.jenkins_key_name
  vpc_security_group_ids = [aws_security_group.jenkins.id]
  iam_instance_profile = aws_iam_instance_profile.jenkins.name

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = {
    Name = "jenkins-${var.env}"
    Role = "ci"
  }
}