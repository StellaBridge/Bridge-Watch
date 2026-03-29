# Bridge Watch Infrastructure Outputs

output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.network.vpc_id
}

output "eks_cluster_endpoint" {
  description = "The endpoint for communication with EKS"
  value       = module.kubernetes.cluster_endpoint
}

output "rds_endpoint" {
  description = "The RDS connection endpoint"
  value       = module.database.db_endpoint
}

output "redis_primary_endpoint" {
  description = "The primary Redis connection endpoint"
  value       = module.redis.redis_primary_endpoint
}

output "alb_dns_name" {
  description = "External DNS name for the load balancer"
  value       = module.load_balancer.alb_dns_name
}

output "monitoring_alerts_sns_topic" {
  description = "SNS Topic ARN for alerts"
  value       = module.monitoring.sns_topic_arn
}
