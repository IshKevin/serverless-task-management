data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../backend/dist"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_iam_role" "exec" {
  name = "task-mgmt-pre-signup-exec-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "main" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "task-mgmt-pre-signup-${var.env}"
  role             = aws_iam_role.exec.arn
  handler          = "preSignup.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      ALLOWED_DOMAINS = join(",", var.allowed_domains)
    }
  }
  tags = var.tags
}
