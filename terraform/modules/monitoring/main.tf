# Module: Monitoring (CloudWatch and Alerting)
# Purpose: Provision centralized logging, metrics dashboards, and performance monitoring alerts.

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "vpc_id" {
  description = "The ID of the VPC to monitor"
  type        = string
}

variable "alert_email" {
  description = "Email address for CloudWatch alert notifications"
  type        = string
  default     = "ops@bridgewatch.network"
}

# CloudWatch Log Group for Application
resource "aws_cloudwatch_log_group" "app" {
  name              = "/bridge-watch/${var.environment}/backend"
  retention_in_days = 30

  tags = {
    Name = "bridge-watch-${var.environment}-logs"
  }
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "bridge-watch-${var.environment}-alerts"

  tags = {
    Name = "bridge-watch-${var.environment}-alerts"
  }
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Dashboard for System Overview
resource "aws_cloudwatch_dashboard" "system" {
  dashboard_name = "bridge-watch-${var.environment}"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", "bridge-watch-${var.environment}-db"]
          ]
          period = 300
          stat   = "Average"
          region = "us-east-1"
          title  = "RDS CPU Utilization"
        }
      }
    ]
  })
}

output "cloudwatch_log_group_name" {
  description = "The name of the log group for application logs"
  value       = aws_cloudwatch_log_group.app.name
}

output "sns_topic_arn" {
  description = "The ARN of the SNS topic for alerts"
  value       = aws_sns_topic.alerts.arn
}
