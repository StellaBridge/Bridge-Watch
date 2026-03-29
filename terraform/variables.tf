# Root Infrastructure Variables

variable "aws_region" {
  description = "Target AWS cluster region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Target deployment environment"
  type        = string
  default     = "dev"
}

variable "availability_zones" {
  description = "Target availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "vpc_cidr" {
  description = "Address space for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Address space for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Address space for private subnets"
  type        = list(string)
  default     = ["10.0.3.0/24", "10.0.4.0/24"]
}

variable "db_user" {
  description = "The database cluster username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "The database cluster password"
  type        = string
  sensitive   = true
}

variable "db_name" {
  description = "The analytics database name"
  type        = string
  default     = "bridgewatch_analytics"
}

variable "kms_key_id" {
  description = "KMS Key for encryption at rest"
  type        = string
}

variable "certificate_arn" {
  description = "ACM Certificate ARN for the ALB"
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email address for operations alerts"
  type        = string
}
