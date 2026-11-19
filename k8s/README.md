Kubernetes Secrets (SOPS)
=========================

This repository uses Mozilla SOPS to encrypt Kubernetes secret manifests before
they are committed. The repository contains a template `k8s/secret.yaml` that
must be encrypted with SOPS prior to committing real values.

Quick commands:

- Decrypt for editing:
  sops --decrypt k8s/secret.yaml > k8s/secret.dec.yaml

- Edit `k8s/secret.dec.yaml` (do not commit this file).

- Re-encrypt in-place after editing:
  sops --encrypt --in-place k8s/secret.dec.yaml && mv k8s/secret.dec.yaml k8s/secret.yaml

CI Integration
--------------
The CI pipeline runs a lightweight check that validates `k8s/secret.yaml`
contains SOPS metadata (a top-level `sops:` mapping). The CI check does not
require an encryption key and only verifies that the file is encrypted.

Provider and Key
----------------
The project uses AWS KMS for secret encryption. The `k8s/.sops.yaml` file
contains a placeholder KMS ARN — replace it with the real KMS key ARN or set
up SOPS with the project's KMS key as described in internal infra docs.

Security Notes
--------------
- Never commit decrypted secret files. Add `k8s/secret.dec.yaml` to `.gitignore`.
- Base64 encoding is not encryption — always use SOPS for secret material.
# Bridge Watch — Kubernetes Deployment

This directory contains all Kubernetes manifests for deploying Bridge Watch to a production cluster.

## Directory layout

```
k8s/
├── namespace.yaml          # bridge-watch namespace
├── rbac.yaml               # ServiceAccount, Role, RoleBinding
├── configmap.yaml          # Non-secret environment config
├── secret.yaml             # Secret template (populate before applying)
├── ingress.yaml            # Nginx Ingress with TLS
├── network-policy.yaml     # Pod-level network isolation
├── pdb.yaml                # PodDisruptionBudgets
├── backend/
│   ├── deployment.yaml     # Backend Fastify API
│   ├── service.yaml        # ClusterIP service
│   └── hpa.yaml            # HorizontalPodAutoscaler (2–8 replicas)
├── frontend/
│   ├── deployment.yaml     # React frontend
│   └── service.yaml        # ClusterIP service
├── postgres/
│   ├── pvc.yaml            # 20Gi PersistentVolumeClaim
│   └── deployment.yaml     # TimescaleDB (postgres:15)
└── redis/
    ├── pvc.yaml            # 5Gi PersistentVolumeClaim
    └── deployment.yaml     # Redis 7 with persistence
```

## Prerequisites

- Kubernetes 1.25+
- `kubectl` configured against your cluster
- Nginx Ingress Controller installed
- `cert-manager` installed (for TLS — optional, remove cert-manager annotation if not used)

## Quick start

### 1. Populate secrets

Copy `secret.yaml`, fill in base64-encoded values, and keep it out of version control:

```bash
cp k8s/secret.yaml k8s/secret.local.yaml
# Edit k8s/secret.local.yaml with real values
echo "k8s/secret.local.yaml" >> .gitignore
```

Encode a value:
```bash
echo -n "my-password" | base64
```

### 2. Update placeholder values

In `ingress.yaml` and `frontend/deployment.yaml`, replace `bridge-watch.example.com` with your actual domain.

Update the container image tags in `backend/deployment.yaml` and `frontend/deployment.yaml` to the version you want to deploy.

### 3. Apply manifests

```bash
# Namespace first
kubectl apply -f k8s/namespace.yaml

# Infrastructure
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.local.yaml   # your local copy with real secrets

# Storage
kubectl apply -f k8s/postgres/pvc.yaml
kubectl apply -f k8s/redis/pvc.yaml

# Datastores
kubectl apply -f k8s/postgres/deployment.yaml
kubectl apply -f k8s/redis/deployment.yaml

# Wait for datastores to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n bridge-watch --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis   -n bridge-watch --timeout=60s

# Application
kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml
kubectl apply -f k8s/backend/hpa.yaml
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml

# Networking
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/network-policy.yaml
kubectl apply -f k8s/pdb.yaml
```

Or apply the whole directory at once (after secrets are ready):
```bash
kubectl apply -f k8s/
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
```

### 4. Run database migrations

```bash
kubectl exec -n bridge-watch deploy/bridge-watch-backend -- npm run migrate
```

### 5. Verify deployment

```bash
kubectl get pods -n bridge-watch
kubectl get ingress -n bridge-watch
kubectl logs -n bridge-watch deploy/bridge-watch-backend --tail=50
```

## TLS and Security Configuration

### TLS Enforcement

The ingress is configured to enforce TLS 1.2 and TLS 1.3 only, disabling legacy SSL/TLS versions that may be vulnerable to downgrade attacks. This meets PCI-DSS and SOC 2 compliance requirements.

**Key annotations in `ingress.yaml`:**
- `nginx.ingress.kubernetes.io/ssl-protocols: "TLSv1.2 TLSv1.3"` — Enforces minimum TLS 1.2
- `nginx.ingress.kubernetes.io/ssl-redirect: "true"` — Redirects HTTP to HTTPS
- `nginx.ingress.kubernetes.io/force-ssl-redirect: "true"` — Forces HTTPS for all paths

### Rate Limiting

Ingress-level rate limiting protects the backend from DoS attacks before requests reach the application:

- **Limit RPS:** 100 requests per second per IP
- **Burst:** 200 requests (allows short traffic spikes)
- **Whitelist:** 10.0.0.0/8 (internal network, excluded from rate limits)

Adjust `limit-rps` and `limit-burst` values based on expected traffic patterns.

### HSTS Headers

Strict-Transport-Security (HSTS) headers are set with:
- `max-age=31536000` — 1 year validity
- `includeSubDomains` — Applies to all subdomains
- `preload` — Allows inclusion in HSTS preload lists

## Health endpoints

| Path | Purpose |
|------|---------|
| `/health/live` | Liveness probe — process is running |
| `/health/ready` | Readiness probe — DB and Redis connected |
| `/metrics` | Prometheus metrics |

## Scaling

Backend scales automatically between 2–8 replicas via HPA based on CPU (70%) and memory (80%) utilisation. To scale manually:

```bash
kubectl scale deployment bridge-watch-backend -n bridge-watch --replicas=4
```

## Updating images

```bash
kubectl set image deployment/bridge-watch-backend \
  backend=ghcr.io/stellabridge/bridge-watch-backend:<new-tag> \
  -n bridge-watch

kubectl set image deployment/bridge-watch-frontend \
  frontend=ghcr.io/stellabridge/bridge-watch-frontend:<new-tag> \
  -n bridge-watch
```
