# Module: Database/RDS (PostgreSQL + TimescaleDB)
# Purpose: Provision a managed RDS instance configured for Bridge Watch analytics.

variable "vpc_id" {
  description = "The ID of the VPC where the RDS instance will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "Subnet IDs for the RDS subnet group"
  type        = list(string)
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "db_instance_class" {
  description = "The database instance type"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "The name of the database"
  type        = string
  default     = "bridgewatch_analytics"
}

variable "db_user" {
  description = "The master username for the database"
  type        = string
}

variable "db_password" {
  description = "The master password for the database"
  type        = string
  sensitive   = true
}

variable "kms_key_id" {
  description = "The ID of the KMS key for database encryption"
  type        = string
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name        = "bridge-watch-${var.environment}-rds-sg"
  vpc_id      = var.vpc_id
  description = "Security group for Bridge Watch database"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # Restricted to VPC internal traffic
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "bridge-watch-${var.environment}-rds-sg"
  }
}

# RDS Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "bridge-watch-${var.environment}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "bridge-watch-${var.environment}-db-subnet-group"
  }
}

# RDS Parameter Group (For TimescaleDB extensions/configuration)
resource "aws_db_parameter_group" "postgresql" {
  name        = "bridge-watch-parameter-group"
  family      = "postgres15"
  description = "Bridge-Watch RDS parameter group with TimescaleDB support"

  parameter {
    name  = "shared_preload_libraries"
    value = "timescaledb"
  }

  parameter {
    name  = "timescaledb.telemetry"
    value = "off"
  }

  tags = {
    Name = "bridge-watch-parameter-group"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  allocated_storage      = 20
  max_allocated_storage  = 100
  storage_type           = "gp3"
  engine                 = "postgres"
  engine_version         = "15.4"
  instance_class         = var.db_instance_class
  db_name                = var.db_name
  username               = var.db_user
  password               = var.db_password
  parameter_group_name   = aws_db_parameter_group.postgresql.name
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = var.environment != "prod"
  multi_az               = var.environment == "prod"
  storage_encrypted      = true
  kms_key_id             = var.kms_key_id

  tags = {
    Name = "bridge-watch-${var.environment}-db"
  }
}

output "db_endpoint" {
  description = "The RDS connection endpoint"
  value       = aws_db_instance.main.endpoint
}

output "db_port" {
  description = "The database connection port"
  value       = aws_db_instance.main.port
}
