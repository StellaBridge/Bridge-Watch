# Bridge Watch Terraform Infrastructure

Modular infrastructure-as-code (IaC) for provisioning the Bridge Watch analytics system on AWS.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads.html) >= 1.5.0
- [AWS CLI](https://aws.amazon.com/cli/) configured with appropriate permissions.
- [kubectl](https://kubernetes.io/docs/tasks/tools/) for interacting with EKS.

## Directory Structure

```text
terraform/
├── main.tf            # Root module joining all sub-modules
├── variables.tf       # Root-level variables and defaults
├── outputs.tf         # Root-level outputs (ALB, EKS, RDS endpoints)
└── modules/           # Reusable sub-modules
    ├── network/       # VPC, Subnets, NAT Gateways
    ├── database/      # Managed RDS (PostgreSQL + TimescaleDB)
    ├── redis/         # ElastiCache (Redis)
    ├── kubernetes/    # Managed EKS Cluster + Node Groups
    ├── load_balancer/ # ALB + HTTP/HTTPS Listeners
    ├── monitoring/    # CloudWatch Logs, Dashboards, and SNS
    └── backup/        # AWS Backup Vault and Backup plan
```

## Remote State Backend Configuration

**Production environments must use a remote backend to prevent state loss and enable team collaboration.**

### Prerequisites

1. Create an S3 bucket for state storage:
   ```bash
   aws s3api create-bucket \
     --bucket bridge-watch-tfstate-$(aws sts get-caller-identity --query Account --output text) \
     --region us-east-1
   ```

2. Enable versioning on the S3 bucket:
   ```bash
   aws s3api put-bucket-versioning \
     --bucket bridge-watch-tfstate-ACCOUNT_ID \
     --versioning-configuration Status=Enabled
   ```

3. Block public access to the bucket:
   ```bash
   aws s3api put-public-access-block \
     --bucket bridge-watch-tfstate-ACCOUNT_ID \
     --public-access-block-configuration \
       "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
   ```

4. Create a DynamoDB table for state locking:
   ```bash
   aws dynamodb create-table \
     --table-name bridge-watch-tfstate-lock \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region us-east-1
   ```

5. (Optional) Create a KMS key for server-side encryption:
   ```bash
   aws kms create-key --description "Terraform state encryption" --region us-east-1
   ```

### Initialize Terraform with Remote Backend

```bash
cd terraform
terraform init \
  -backend-config="bucket=bridge-watch-tfstate-ACCOUNT_ID" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=bridge-watch-tfstate-lock" \
  -backend-config="encrypt=true" \
  -backend-config="kms_key_id=arn:aws:kms:us-east-1:ACCOUNT_ID:key/KEY_ID"
```

### State Locking

The DynamoDB table provides distributed state locking, preventing concurrent modifications that could corrupt state. If a lock is held longer than expected:

```bash
aws dynamodb scan \
  --table-name bridge-watch-tfstate-lock \
  --region us-east-1
```

## Quick Start (Initial Deployment)

1.  **Configure Remote Backend** (see above)

2.  **Create a Workspace (Optional but Recommended)**
    ```bash
    terraform workspace new dev
    ```

3.  **Deploy Infrastructure**
    Create a `terraform.tfvars` file for your environment and then run:
    ```bash
    terraform apply -var-file=dev.tfvars
    ```

## Module Reference (Variables)

### `network`
- `vpc_cidr`: CIDR block for the VPC.
- `availability_zones`: Target zones for subnet distribution.

### `database`
- `db_instance_class`: Performance tier for RDS.
- `db_user` / `db_password`: Credentials for the analytics database (TimescaleDB).
- `kms_key_id`: Encryption key for storage.

### `kubernetes`
- `cluster_version`: K8s version (default: 1.27).
- `node_instance_types`: EC2 instance types for workers.

## Important Notes on TimescaleDB

The `database` module utilizes an RDS Parameter Group to enable `timescaledb` in `shared_preload_libraries`. Upon first connection to the database, the extension must be manually enabled within the SQL engine:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

## Maintenance & Backups

This infrastructure includes a `backup` module that manages automated daily snapshots for RDS and other tagged resources. Resources must be tagged with `Backup: Daily` to be included in the automated backup plan.
