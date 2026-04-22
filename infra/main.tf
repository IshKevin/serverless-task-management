locals {
  tags = {
    Project   = "serverless-task-mgmt"
    Env       = var.env
    ManagedBy = "Terraform"
  }
}

module "database" {
  source = "./modules/database"
  env    = var.env
  tags   = local.tags
}

module "api" {
  source                = "./modules/api"
  env                   = var.env
  aws_region            = var.aws_region
  tags                  = local.tags
  dynamodb_table_name   = module.database.table_name
  dynamodb_table_arn    = module.database.table_arn
  dynamodb_stream_arn   = module.database.stream_arn
  user_pool_id          = module.cognito.user_pool_id
  user_pool_client_id   = module.cognito.user_pool_client_id
  user_pool_arn         = module.cognito.user_pool_arn
  allowed_domains       = var.allowed_domains
  ses_from_email        = var.ses_from_email
}

module "cognito" {
  source                 = "./modules/cognito"
  env                    = var.env
  tags                   = local.tags
  pre_signup_lambda_arn  = module.api.pre_signup_lambda_arn
  pre_signup_lambda_name = module.api.pre_signup_lambda_name
}
