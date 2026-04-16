resource "aws_cognito_user_pool" "main" {
  name = "task-mgmt-${var.env}"

  auto_verified_attributes = ["email"]

  schema {
    name = "email"
    attribute_data_type = "String"
    required = true
    mutable = false
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.pre_signup.arn
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name = "web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
  generate_secret = false
}

resource "aws_cognito_user_pool_group" "admin" {
  name = "Admin"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_group" "member" {
  name = "Member"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_lambda_permission" "cognito_pre_signup" {
  statement_id = "AllowCognitoInvoke"
  action = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal = "cognito-idp.amazonaws.com"
  source_arn = aws_cognito_user_pool.main.arn
}