output "app_id"       { value = aws_amplify_app.frontend.id }
output "default_domain" { value = aws_amplify_app.frontend.default_domain }
output "app_url"      { value = "https://main.${aws_amplify_app.frontend.default_domain}" }
