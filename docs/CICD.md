# Bridge-Watch CI/CD Pipeline

This document describes the CI/CD pipeline for the Bridge-Watch project, implemented using GitHub Actions.

## Workflows

### 1. CI (ci.yml)
- **Triggers**: Main and Develop branches, and PRs targeting them.
- **Node.js**:
  - Installs dependencies (`npm ci`).
  - Lints (`npm run lint`).
  - Builds (backend & frontend).
  - Tests (backend & frontend).
- **Rust (Contracts)**:
  - Formats check (`cargo fmt`).
  - Lints (`cargo clippy`).
  - Builds and tests contracts.

### 2. Security Scanning (security.yml)
- **Static Analysis**: Uses CodeQL to scan JavaScript and TypeScript for vulnerabilities.
- **Dependency Audit**: Runs `npm audit` and `cargo audit` to find insecure dependencies.
- **Schedule**: Runs on pushes, PRs, and weekly on Sundays.

### 3. Docker Build & Push (docker.yml)
- **Triggers**: Pushes to `main` and `develop`.
- **Registry**: GitHub Container Registry (GHCR).
- **Images**: Builds separate images for `backend` and `frontend`.
- **Tags**: Environment (`main`/`develop`) and SHA for traceability.

### 4. Deployment (deploy.yml)
- **Automatic Deployment**: Runs after a successful Docker build.
- **Staging**: Automatically deploys the `develop` branch to the staging environment.
- **Production**: Deploys the `main` branch to the production environment.
- **Approval Gates**: Production deployments MUST be manually approved via the GitHub UI (Settings > Environments).

## Required Secrets & Setup

To enable the full pipeline, the following configuration is needed in the GitHub repository:

### Environment Secrets
- **staging**:
  - `DEPLOY_HOST`: Staging server address.
  - `DEPLOY_USER`: SSH user for staging.
  - `DEPLOY_KEY`: Private SSH key for staging.
- **production**:
  - `DEPLOY_HOST`: Production server address.
  - `DEPLOY_USER`: SSH user for production.
  - `DEPLOY_KEY`: Private SSH key for production.

### GitHub Environments
1. Go to **Settings > Environments**.
2. Create `staging` and `production` environments.
3. For `production`, enable **Required reviewers** to enforce approval gates.

## Rollback Capability
In the event of a failure, you can roll back by:
1. Reverting the commit in Git.
2. Manually triggering the "Docker Build & Push" workflow for a previous SHA.
3. The deployment workflow will automatically pick up the new (reverted) image.
