locals {
  tags = {
    Project   = "serverless-task-mgmt"
    Env       = var.env
    ManagedBy = "Terraform"
  }
}

# pre_signup has no dependency on Cognito — breaks the api ↔ cognito cycle
module "pre_signup" {
  source          = "./modules/pre_signup"
  env             = var.env
  tags            = local.tags
  allowed_domains = var.allowed_domains
}

module "database" {
  source = "./modules/database"
  env    = var.env
  tags   = local.tags
}

# cognito depends on pre_signup (not on api)
module "cognito" {
  source                 = "./modules/cognito"
  env                    = var.env
  tags                   = local.tags
  pre_signup_lambda_arn  = module.pre_signup.lambda_arn
  pre_signup_lambda_name = module.pre_signup.lambda_name
}

# api depends on cognito and database (no more cycle)
module "api" {
  source              = "./modules/api"
  env                 = var.env
  aws_region          = var.aws_region
  tags                = local.tags
  dynamodb_table_name = module.database.table_name
  dynamodb_table_arn  = module.database.table_arn
  dynamodb_stream_arn = module.database.stream_arn
  user_pool_id        = module.cognito.user_pool_id
  user_pool_client_id = module.cognito.user_pool_client_id
  user_pool_arn       = module.cognito.user_pool_arn
  ses_from_email      = var.ses_from_email
}

# Register and verify the SES sender identity so Lambda can send emails
resource "aws_ses_email_identity" "sender" {
  email = var.ses_from_email
}

#React frontend hosted on AWS Amplify (manual zip deployment via null_resource)
module "amplify" {
  source               = "./modules/amplify"
  env                  = var.env
  tags                 = local.tags
  api_endpoint         = module.api.api_endpoint
  user_pool_id         = module.cognito.user_pool_id
  user_pool_client_id  = module.cognito.user_pool_client_id
}
