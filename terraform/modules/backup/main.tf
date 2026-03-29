# Module: Backup (Cloud Backup Strategy)
# Purpose: Provision centralized, cross-region backups for RDS, EFS, and EBS.

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "backup_retention_days" {
  description = "Days of backup retention"
  type        = number
  default     = 7
}

# IAM Role for AWS Backup
resource "aws_iam_role" "backup" {
  name = "bridge-watch-${var.environment}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "backup.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup_AWSBackupServiceRolePolicyForBackup" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
  role       = aws_iam_role.backup.name
}

resource "aws_iam_role_policy_attachment" "backup_AWSBackupServiceRolePolicyForRestores" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
  role       = aws_iam_role.backup.name
}

# AWS Backup Vault
resource "aws_backup_vault" "main" {
  name = "bridge-watch-${var.environment}-backup-vault"

  tags = {
    Name = "bridge-watch-${var.environment}-backup-vault"
  }
}

# AWS Backup Plan
resource "aws_backup_plan" "main" {
  name = "bridge-watch-${var.environment}-backup-plan"

  rule {
    rule_name         = "daily-backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 ? * * *)" # Daily at 05:00 UTC
    start_window      = 60
    completion_window = 120

    lifecycle {
      delete_after = var.backup_retention_days
    }
  }

  tags = {
    Name = "bridge-watch-${var.environment}-backup-plan"
  }
}

# Resource Selection (Placeholder) - Tag-based Backup
resource "aws_backup_selection" "main" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "bridge-watch-${var.environment}-backup-selection"
  plan_id      = aws_backup_plan.main.id

  selection_tag {
    type  = "STRINGEQUALS"
    key   = "Backup"
    value = "Daily"
  }
}

output "backup_vault_arn" {
  description = "The ARN of the backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_plan_id" {
  description = "The ID of the backup plan"
  value       = aws_backup_plan.main.id
}
