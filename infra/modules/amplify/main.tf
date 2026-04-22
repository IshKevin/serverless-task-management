resource "aws_amplify_app" "frontend" {
  name = "task-mgmt-${var.env}"

  # Build spec used when Amplify builds from a connected repository
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
  EOT

  # Redirect all paths to index.html for React SPA routing
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  custom_rule {
    source = "/<*>"
    status = "404"
    target = "/index.html"
  }

  environment_variables = {
    VITE_API_ENDPOINT        = var.api_endpoint
    VITE_USER_POOL_ID        = var.user_pool_id
    VITE_USER_POOL_CLIENT_ID = var.user_pool_client_id
  }

  tags = var.tags
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = "main"
  stage       = var.env == "prod" ? "PRODUCTION" : "DEVELOPMENT"

  environment_variables = {
    VITE_API_ENDPOINT        = var.api_endpoint
    VITE_USER_POOL_ID        = var.user_pool_id
    VITE_USER_POOL_CLIENT_ID = var.user_pool_client_id
  }

  tags = var.tags
}

# Build the frontend and deploy it to Amplify via manual zip deployment.
# Requires: npm, aws CLI, and curl to be available on the machine running terraform apply.
resource "null_resource" "deploy_frontend" {
  depends_on = [aws_amplify_branch.main]

  # Re-deploy whenever the app config or backend endpoints change
  triggers = {
    app_id           = aws_amplify_app.frontend.id
    api_endpoint     = var.api_endpoint
    user_pool_id     = var.user_pool_id
    user_pool_client = var.user_pool_client_id
  }

  provisioner "local-exec" {
    working_dir = "${path.root}/.."
    interpreter = ["/bin/bash", "-c"]
    command     = <<-SCRIPT
      set -euo pipefail
      cd frontend

      # Write the generated .env so Vite injects the correct values at build time
      cat > .env <<EOF
VITE_API_ENDPOINT=${var.api_endpoint}
VITE_USER_POOL_ID=${var.user_pool_id}
VITE_USER_POOL_CLIENT_ID=${var.user_pool_client_id}
EOF

      echo "==> Installing frontend dependencies..."
      npm ci --prefer-offline

      echo "==> Building frontend..."
      npm run build

      echo "==> Packaging dist/..."
      DIST_ZIP="/tmp/task-mgmt-frontend-${var.env}.zip"
      rm -f "$DIST_ZIP"
      python3 -c "
import zipfile, os, sys
out = sys.argv[1]
src = 'dist'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, src))
print('Packaged', out)
" "$DIST_ZIP"

      echo "==> Creating Amplify manual deployment..."
      DEPLOY_JSON=$(aws amplify create-deployment \
        --app-id "${aws_amplify_app.frontend.id}" \
        --branch-name "${aws_amplify_branch.main.branch_name}" \
        --no-cli-pager \
        --output json)

      JOB_ID=$(python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['jobId'])" <<< "$DEPLOY_JSON")
      UPLOAD_URL=$(python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['zipUploadUrl'])" <<< "$DEPLOY_JSON")

      echo "==> Uploading frontend zip (job $JOB_ID)..."
      curl -s --fail \
        -H "Content-Type: application/zip" \
        --upload-file "$DIST_ZIP" \
        "$UPLOAD_URL"
      rm -f "$DIST_ZIP"

      echo "==> Starting Amplify deployment..."
      aws amplify start-deployment \
        --app-id "${aws_amplify_app.frontend.id}" \
        --branch-name "${aws_amplify_branch.main.branch_name}" \
        --job-id "$JOB_ID" \
        --no-cli-pager

      echo "==> Frontend deployed: https://main.${aws_amplify_app.frontend.default_domain}"
    SCRIPT
  }
}
