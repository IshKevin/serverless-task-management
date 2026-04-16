data "archive_file" "lambda_zip" {
  type = "zip"
  source_dir = "${path.module}/../backend/dist"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_iam_role" "lambda_exec" {
  name = "task-mgmt-lambda-exec-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_ddb_ses" {
  name = "ddb-ses-access"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
        Resource = [aws_dynamodb_table.tasks.arn, "${aws_dynamodb_table.tasks.arn}/index/*"]
      },
      {
        Effect = "Allow"
        Action = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "api" {
  filename = data.archive_file.lambda_zip.output_path
  function_name = "task-mgmt-api-${var.env}"
  role = aws_iam_role.lambda_exec.arn
  handler = "index.handler"
  runtime = "nodejs20.x"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout = 10

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.tasks.name
      USER_POOL_ID = aws_cognito_user_pool.main.id
    }
  }
}

resource "aws_lambda_function" "pre_signup" {
  filename = data.archive_file.lambda_zip.output_path
  function_name = "task-mgmt-pre-signup-${var.env}"
  role = aws_iam_role.lambda_exec.arn
  handler = "preSignup.handler"
  runtime = "nodejs20.x"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      ALLOWED_DOMAINS = join(",", var.allowed_domains)
    }
  }
}