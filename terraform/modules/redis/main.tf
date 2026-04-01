# Module: Redis/ElastiCache
# Purpose: Provision a managed Redis cluster for session storage and message queuing (BullMQ).

variable "vpc_id" {
  description = "The ID of the VPC where Redis will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "Subnet IDs for the Redis subnet group"
  type        = list(string)
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "redis_node_type" {
  description = "The Redis instance type"
  type        = string
  default     = "cache.t3.small"
}

variable "redis_cluster_size" {
  description = "Number of cache nodes in the replication group"
  type        = number
  default     = 1
}

# Redis Security Group
resource "aws_security_group" "redis" {
  name        = "bridge-watch-${var.environment}-redis-sg"
  vpc_id      = var.vpc_id
  description = "Security group for Bridge Watch Redis cluster"

  ingress {
    from_port   = 6379
    to_port     = 6379
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
    Name = "bridge-watch-${var.environment}-redis-sg"
  }
}

# Redis Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "bridge-watch-${var.environment}-redis-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "bridge-watch-${var.environment}-redis-subnet-group"
  }
}

# Redis Replication Group
resource "aws_elasticache_replication_group" "main" {
  replication_group_id          = "bridge-watch-${var.environment}-redis"
  replication_group_description = "Bridge-Watch Redis cluster for caching and BullMQ jobs"
  node_type                     = var.redis_node_type
  num_cache_clusters            = var.redis_cluster_size
  engine                        = "redis"
  engine_version                = "7.0"
  port                          = 6379
  parameter_group_name          = "default.redis7"
  subnet_group_name             = aws_elasticache_subnet_group.main.name
  security_group_ids            = [aws_security_group.redis.id]
  at_rest_encryption_enabled    = true
  transit_encryption_enabled   = true
  auto_minor_version_upgrade    = true

  tags = {
    Name = "bridge-watch-${var.environment}-redis"
  }
}

output "redis_primary_endpoint" {
  description = "The primary endpoint for Redis connection"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "The reader endpoint (if cluster enabled) for Redis connection"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}
