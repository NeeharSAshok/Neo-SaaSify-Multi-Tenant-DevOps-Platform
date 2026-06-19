output "cluster_endpoint" {
  value       = module.eks.cluster_endpoint
  description = "The endpoint for the EKS Kubernetes API."
}

output "cluster_name" {
  value       = module.eks.cluster_name
  description = "The name of the EKS Kubernetes cluster."
}

output "vpc_id" {
  value       = module.vpc.vpc_id
  description = "The ID of the VPC created for EKS."
}
