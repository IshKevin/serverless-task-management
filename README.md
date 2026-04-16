# Serverless Task Management System

Production-grade serverless app on AWS using **React 19 + Vite**, **Terraform 1.9**, **Ansible 2.17**, and **Jenkins on EC2**. Built for the Amalitech Serverless Lab. Deadline: Feb 20, 2026.

### **Live System Overview**
![System Architecture](docs/architecture.png)
*Figure 1: End-to-end flow - Amplify → Cognito → API Gateway → Lambda → DynamoDB/SES*

## **1. Architecture**

| Layer | Tech | Why Modern | Where It Runs |
| --- | --- |
| **Frontend** | React 19 + Vite + TypeScript + TanStack Query + Tailwind + shadcn/ui | React 19 RSC, Vite HMR, no CSS-in-JS runtime | **AWS Amplify Hosting** `us-east-1` |
| **Auth** | AWS Cognito + Amplify Gen 2 | TypeScript-first, pre-signup Lambda for domain lock | **AWS Cognito** `eu-west-1` |
| **API** | API Gateway HTTP API + JWT Authorizer | 60% cheaper + faster than REST API | **AWS API Gateway** |
| **Backend** | AWS Lambda + Hono + Node 20 | Hono = 3x faster cold starts vs Express | **AWS Lambda** |
| **Database** | DynamoDB Single-Table | Pay-per-request, GSI for `assignedTo` query | **AWS DynamoDB** |
| **Notifications** | AWS SES | Triggered by Lambda on assign/status | **AWS SES** |
| **IaC** | Terraform 1.9 + AWS 5.x | Modules, `for_each`, full state mgmt | **Your machine / Jenkins** |
| **Config** | Ansible 2.17 + Molecule | Day-2 ops: Jenkins, Cognito groups | **Runs on Jenkins EC2** |
| **CI/CD** | Jenkins 2.462 + JCasC + Blue Ocean | Pipelines as Code on dedicated EC2 | **EC2 t3.medium** `eu-west-1` |
| **Testing** | Vitest + Playwright + npm | Unit + E2E, coverage reports | **Jenkins + Local** |

### **Data Flow**
1. User logs into React app → Cognito Hosted UI validates `@amalitech.com` or `@amalitechtraining.org`
2. React calls `https://api.xxx.com/tasks` with JWT
3. API Gateway validates JWT → invokes Lambda
4. Lambda checks `cognito:groups` for `Admin` vs `Member` → writes to DynamoDB
5. On create/update, Lambda sends SES email to assignees
6. React uses TanStack Query to poll/cache `/tasks`

## **2. Requirements**

- AWS Sandbox Account: `assigned by Amalitech`
- Terraform >= 1.9.0
- Ansible >= 2.17
- Node.js 20.x + pnpm 9.x
- AWS CLI v2 configured with `aws configure sso`
- EC2 Key Pair named `jenkins-key` in `eu-west-1`

## **3. Quick Start**

### **Step 1: Deploy Infrastructure**
```bash
cd infra
terraform init
terraform apply -var="jenkins_key_name=jenkins-key" -var='admin_cidr_blocks=["YOUR.IP.HERE/32"]'
```
Output gives you: `api_endpoint`, `user_pool_id`, `user_pool_client_id`, `jenkins_public_ip`

![Terraform Apply](docs/terraform-apply.png)
*Figure 2: Terraform creating Cognito, Lambda, API Gateway, DynamoDB, and Jenkins EC2*

### **Step 2: Configure Jenkins with Ansible**
```bash
cd config
# 1. Update inventory.ini: replace JENKINS_IP with output from terraform
# 2. Run playbook
ansible-playbook -i inventory.ini jenkins-setup.yml
```
This installs Java 17, Jenkins, Node 20, Terraform, pnpm, and loads `jenkins/casc.yaml` for Configuration as Code.

![Jenkins Blue Ocean](docs/jenkins-blue-ocean.png)
*Figure 3: Jenkins Blue Ocean UI running 3 pipelines: infra, backend, frontend*

### **Step 3: Seed Cognito Groups + Test Users**
```bash
cd config
ansible-playbook -i inventory.ini cognito-seed.yml
```
Creates `Admin` and `Member` groups + test users `admin@amalitech.com` and `member@amalitechtraining.org`.

### **Step 4: Frontend Setup**
```bash
cd frontend
cp .env.example .env
# Paste TF outputs into .env:
# VITE_API_ENDPOINT=https://xxx.execute-api.eu-west-1.amazonaws.com
# VITE_USER_POOL_ID=eu-west-1_xxxx
# VITE_USER_POOL_CLIENT_ID=xxxx

pnpm install
pnpm run dev
```
Visit `http://localhost:5173` → redirects to Cognito login.

![React App Running](docs/react-app.png)
*Figure 4: React 19 app after login. Admin view shows "Create Task" form. Member view shows assigned tasks only.*

### **Step 5: Backend Local Test**
```bash
cd backend
pnpm install
pnpm test  # vitest unit tests
pnpm run build  # creates dist/ for Lambda
```

## **4. CI/CD with Jenkins**

Jenkins is provisioned at `http://<jenkins_public_ip>:8080`. Initial password shown by Ansible output.

**Pipelines Created Automatically by JCasC:**
1. `infra` - Runs on push to `/infra`. Plans + applies Terraform
2. `backend` - Runs on push to `/backend`. `pnpm test` → build → `aws lambda update-function-code`
3. `frontend` - Runs on push to `/frontend`. `pnpm test` → `playwright test` → build → deploy to Amplify

![Jenkins Build Logs](docs/jenkins-build.png)
*Figure 5: Backend pipeline passing tests with coverage report, then deploying to Lambda*

**Branch Strategy**: Push to `main` to deploy. PRs run tests only.

## **5. Testing**

All tests use `npm`/`pnpm` as required.

| Command | What It Tests | Where |
| --- | --- |
| `cd backend && npm test` | Lambda handlers, zod schemas, RBAC logic | Vitest + coverage to `/coverage` |
| `cd frontend && npm test` | React components, hooks | Vitest + jsdom |
| `cd frontend && npm run test:e2e` | Login → Create Task → Status Update | Playwright against deployed Amplify URL |

![Test Coverage](docs/test-coverage.png)
*Figure 6: Vitest coverage report from Jenkins. Backend at 92%, Frontend at 85%*

## **6. RBAC & Security Rules**

Enforced by Pre-Signup Lambda + API handlers:

| Action | Admin | Member | Unverified | Wrong Domain |
| --- | --- | --- |
| Sign up | ✅ | ❌ | ❌ Blocked at Cognito |
| Create task | ✅ | ❌ 403 | ❌ | ❌ |
| Assign task | ✅ | ❌ 403 | ❌ | ❌ |
| View my tasks | ✅ | ✅ | ❌ | ❌ |
| Update status | ✅ | ✅ only if assigned | ❌ | ❌ |
| Call API w/o JWT | ❌ 401 | ❌ 401 | ❌ 401 | ❌ 401 |

## **7. Key Files**

```
infra/
  main.tf          # Providers + tags
  cognito.tf       # User pool + groups + pre-signup Lambda
  lambda.tf        # API Lambda + IAM roles
  api.tf           # API Gateway HTTP + JWT authorizer
  dynamodb.tf      # Tasks table + GSI
  jenkins.tf       # EC2 + SG + IAM for Jenkins
backend/
  src/index.ts     # Hono app: POST /tasks, GET /tasks, PATCH /tasks/:id
  src/preSignup.ts # Blocks non-amalitech emails
  src/index.test.ts# Vitest unit tests
frontend/
  src/App.tsx      # Admin vs Member UI
  src/amplify.ts   # Amplify Gen 2 config
  e2e/auth.spec.ts # Playwright login test
config/
  jenkins-setup.yml # Installs Jenkins + JCasC
  cognito-seed.yml  # Creates groups/users
jenkins/
  casc.yaml        # Jenkins Configuration as Code
  Jenkinsfile.*    # 3 pipelines
```

## **8. How to Add Screenshots**

Replace placeholders in `/docs`:
1. `architecture.png` - Export from draw.io or CloudCraft
2. `terraform-apply.png` - Screenshot of `terraform apply` finishing
3. `jenkins-blue-ocean.png` - Blue Ocean dashboard with 3 green pipelines
4. `react-app.png` - App running with tasks visible
5. `jenkins-build.png` - Console output showing tests + deploy
6. `test-coverage.png` - HTML coverage report

## **9. Cleanup**
```bash
cd infra
terraform destroy -var="jenkins_key_name=jenkins-key"
```
Destroys all AWS resources to avoid Sandbox costs.

## **10. Submission Checklist**

- [ ] All Terraform resources created via code
- [ ] Jenkins EC2 running and configured by Ansible
- [ ] Backend tests: `npm test` > 80% coverage
- [ ] Frontend tests: `npm test` + `npm run test:e2e` pass
- [ ] Domain restriction enforced by PreSignUp Lambda
- [ ] Admin cannot create tasks if not in `Admin` group
- [ ] Email sent on task assign + status change
- [ ] README has 6 screenshots of running system
- [ ] `.gitignore` excludes secrets/state files
- [ ] Submitted before Feb 20, 2026

Questions? Check CloudWatch Logs at `/aws/lambda/task-mgmt-api-dev` for backend errors.
```

---