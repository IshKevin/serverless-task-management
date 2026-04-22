output "api_endpoint" { 
    value = aws_apigatewayv2_api.http.api_endpoint 
    }
output "lambda_api_arn" {
     value = aws_lambda_function.api.arn 
     }
output "pre_signup_lambda_arn" {
     value = aws_lambda_function.pre_signup.arn 
     }
output "pre_signup_lambda_name" {
     value = aws_lambda_function.pre_signup.function_name 
     }