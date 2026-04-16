output "api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "jenkins_public_ip" {
  value = aws_instance.jenkins.public_ip
}

output "jenkins_ssh" {
  value = "ssh -i ${var.jenkins_key_name}.pem ubuntu@${aws_instance.jenkins.public_ip}"
}