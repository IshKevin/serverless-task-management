resource "aws_apigatewayv2_api" "http" {
  name = "task-mgmt-api-${var.env}"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id = aws_apigatewayv2_api.http.id
  authorizer_type = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name = "cognito-auth"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id = aws_apigatewayv2_api.http.id
  integration_type = "AWS_PROXY"
  integration_uri = aws_lambda_function.api.invoke_arn
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id = aws_apigatewayv2_api.http.id
  route_key = "ANY /{proxy+}"
  authorization_type = "JWT"
  authorizer_id = aws_apigatewayv2_authorizer.cognito.id
  target = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id = aws_apigatewayv2_api.http.id
  name = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gw" {
  statement_id = "AllowAPIGatewayInvoke"
  action = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal = "apigateway.amazonaws.com"
  source_arn = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}