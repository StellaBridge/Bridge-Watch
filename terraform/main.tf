# Terraform Provider and Backend Configuration

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.10"
    }
  }

  # In a production environment, this should be an S3 bucket with DynamoDB locking.
  # For the purpose of this PR, we'll keep it as a placeholder.
  # backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Bridge-Watch"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# --- Infrastructure Modules ---

# 1. Network: Provision VPC, Subnets, and NAT GW
module "network" {
  source               = "./modules/network"
  vpc_cidr            = var.vpc_cidr
  availability_zones  = var.availability_zones
  public_subnet_cidrs = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  environment         = var.environment
}

# 2. Database: Managed RDS + TimescaleDB
module "database" {
  source             = "./modules/database"
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnets
  environment        = var.environment
  db_user            = var.db_user
  db_password        = var.db_password
  db_name            = var.db_name
  kms_key_id         = var.kms_key_id
}

# 3. Redis: ElastiCache cluster for cache and BullMQ
module "redis" {
  source             = "./modules/redis"
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnets
  environment        = var.environment
}

# 4. Kubernetes: Managed EKS cluster for container workloads
module "kubernetes" {
  source             = "./modules/kubernetes"
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnets
  environment        = var.environment
}

# 5. Load Balancer: Managed ALB to route external traffic to EKS ingress
module "load_balancer" {
  source             = "./modules/load_balancer"
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnets
  private_subnet_ids = module.network.private_subnets
  environment        = var.environment
  certificate_arn    = var.certificate_arn
}

# 6. Monitoring: CloudWatch Logs, Dashboards, and SNS alerts
module "monitoring" {
  source      = "./modules/monitoring"
  vpc_id      = module.network.vpc_id
  environment = var.environment
  alert_email = var.alert_email
}

# 7. Backup: Centralized Backup Vault and Backup plan
module "backup" {
  source      = "./modules/backup"
  environment = var.environment
}
