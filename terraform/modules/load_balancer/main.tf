# Module: Load Balancer (ALB)
# Purpose: Provision an internal/external load balancer to route traffic to the EKS cluster services (Ingress).

variable "vpc_id" {
  description = "The ID of the VPC for the ALB"
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnet IDs for the public/external interface of the ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Subnet IDs for the internal/private interface of the ALB"
  type        = list(string)
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "certificate_arn" {
  description = "ACM Certificate ARN for HTTPS listener"
  type        = string
  default     = ""
}

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "bridge-watch-${var.environment}-alb-sg"
  vpc_id      = var.vpc_id
  description = "Security group for Bridge Watch Load Balancer"

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "bridge-watch-${var.environment}-alb-sg"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "bridge-watch-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  enable_deletion_protection = var.environment == "prod"

  tags = {
    Name = "bridge-watch-${var.environment}-alb"
  }
}

# Default Target Group for Ingress Controller
resource "aws_lb_target_group" "ingress" {
  name     = "bridge-watch-${var.environment}-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "bridge-watch-${var.environment}-tg"
  }
}

# HTTP Listener
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS Listener (Optional if certificate provided)
resource "aws_lb_listener" "https" {
  count             = var.certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.ingress.arn
  }
}

output "alb_dns_name" {
  description = "The DNS name of the ALB"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "The zone ID of the ALB"
  value       = aws_lb.main.zone_id
}
