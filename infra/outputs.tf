output "api_endpoint" {
  value = module.api.api_endpoint
}

output "user_pool_id" {
  value = module.cognito.user_pool_id
}

output "user_pool_client_id" {
  value = module.cognito.user_pool_client_id
}

output "amplify_app_id" {
  value = module.amplify.app_id
}

output "amplify_app_url" {
  value       = module.amplify.app_url
  description = "Public URL for the hosted frontend"
}
