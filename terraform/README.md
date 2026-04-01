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

## Quick Start (Initial Deployment)

1.  **Initialize Terraform**
    ```bash
    cd terraform
    terraform init
    ```

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
