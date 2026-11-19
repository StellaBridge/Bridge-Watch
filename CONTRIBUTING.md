# Contributing to Stellar Bridge Watch

First off — **thank you** for taking the time to contribute! 🎉

Stellar Bridge Watch is an open-source project and we welcome contributions of every kind: code, documentation, bug reports, design, testing, and community support. No contribution is too small. Whether you're fixing a typo, writing tests, or building a major feature, you're helping make Stellar's cross-chain ecosystem safer and more transparent for everyone.

This document is your complete guide to contributing. Read it once and you'll know exactly how to go from "I want to help" to "my PR is merged."

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Ways to Contribute](#ways-to-contribute)
3. [Before You Start](#before-you-start)
4. [Development Setup](#development-setup)
5. [Coding Standards](#coding-standards)
6. [Secret Scanning and Credential Management](#secret-scanning-and-credential-management)
7. [Creating Issues](#creating-issues)
8. [Pull Request Process](#pull-request-process)
9. [Testing Requirements](#testing-requirements)
10. [Documentation Requirements](#documentation-requirements)
11. [Review Process](#review-process)
12. [Release Process](#release-process)
13. [Communication Channels](#communication-channels)
14. [Recognising Contributors](#recognising-contributors)

---

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Please read it — it's short and ensures Bridge Watch remains a welcoming place for everyone.

Report unacceptable behaviour to **security@stellarbridgewatch.io**. All reports are handled confidentially.

---

## Ways to Contribute

You don't have to write code to make a meaningful impact. Here are all the ways you can help:

| Contribution type | Examples |
|-------------------|---------|
| **Bug reports** | Found something broken? Open a detailed issue. |
| **Feature requests** | Have an idea? We'd love to hear it. |
| **Code** | Fix bugs, build features, improve performance. |
| **Documentation** | Improve guides, add examples, fix typos. |
| **Testing** | Write tests, improve coverage, report flaky tests. |
| **Design** | UI/UX improvements, diagrams, dashboard layouts. |
| **Review** | Review open pull requests — a second pair of eyes helps everyone. |
| **Triage** | Help label and prioritise open issues. |
| **Community support** | Answer questions in GitHub Discussions. |
| **Security** | Responsible disclosure of vulnerabilities. |

### First-time contributors

Look for issues labelled **`good first issue`** — these are specifically scoped for contributors who are new to the project. Issues labelled **`help wanted`** are open to anyone and signal that the maintainers actively want community input.

> **New to open source?** Check out [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/) for a gentle introduction to the whole process.

---

## Before You Start

### Check the issue tracker

Before opening a new issue or starting work, search the [issue tracker](https://github.com/StellaBridge/Bridge-Watch/issues) to make sure the problem or idea hasn't already been raised. A quick search saves everyone time.

### Get assigned before coding

For anything beyond a trivial fix (typos, broken links), please **comment on the issue and wait to be assigned** before opening a PR. This prevents two contributors from duplicating effort on the same problem.

### Understand the project structure

```
Bridge-Watch/
├── backend/          Node.js / Fastify API, services, workers, migrations
├── frontend/         React 18 dashboard (Vite + TailwindCSS)
├── contracts/        Soroban smart contracts (Rust)
├── docs/             Project documentation
├── scripts/          Setup and utility scripts
└── .github/          CI workflows, issue templates, PR template
```

For a deeper introduction read [docs/DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md).

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Backend + frontend |
| npm | 10+ | Package management |
| Rust | latest stable | Soroban contracts |
| Docker | 24+ | PostgreSQL + Redis |
| Docker Compose | 2+ | Dev environment orchestration |
| Git | 2.30+ | Version control |

### Quick start (automated)

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Bridge-Watch.git
cd Bridge-Watch

# 2. Add upstream remote
git remote add upstream https://github.com/StellaBridge/Bridge-Watch.git

# 3. Run the automated setup script
bash scripts/setup.sh
```

The setup script installs dependencies, copies `.env.example` to `.env`, starts Docker services, and runs database migrations automatically.

### Manual setup

If you prefer to set up step by step:

```bash
# 1. Install backend dependencies
cd backend && npm install && cd ..

# 2. Install frontend dependencies
cd frontend && npm install && cd ..

# 3. Build Soroban contracts
cd contracts && cargo build && cd ..

# 4. Configure environment
cp .env.example .env
# Edit .env — the defaults work for local development

# 5. Start PostgreSQL and Redis
docker compose -f docker-compose.dev.yml up -d postgres redis

# 6. Run database migrations
cd backend && npm run migrate && cd ..

# 7. Seed reference data (optional)
cd backend && npm run seed && cd ..

# 8. Start the dev servers
make dev
```

### Verify your setup

| Service | URL | Credentials |
|---------|-----|------------|
| Backend API | http://localhost:3001 | — |
| Frontend | http://localhost:5173 | — |
| PgAdmin | http://localhost:5050 | admin@bridgewatch.dev / admin |
| Redis UI | http://localhost:8081 | admin / admin |

Run the test suite to confirm everything is working:

```bash
cd backend && npm run test:unit
```

### Keeping your fork up to date

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

---

## Coding Standards

All code must pass CI before a PR can be merged. Running checks locally first saves time.

### TypeScript (backend + frontend)

- **TypeScript strict mode** is enabled — no `any` without justification.
- Follow the existing ESLint configuration (`eslint src/ --ext .ts`).
- Use `async/await`; avoid raw Promise chains.
- Prefer named exports over default exports.
- Keep functions small and single-purpose (aim for ≤ 30 lines).
- Avoid deep nesting — use early returns to reduce indentation.
- Do not commit `console.log` statements; use the project logger (`pino`).

```typescript
// ✓ Good
import { logger } from "../utils/logger.js";

export async function getBridgeHealth(symbol: string): Promise<BridgeHealth> {
  const asset = await assetModel.findBySymbol(symbol);
  if (!asset) throw new Error(`Asset not found: ${symbol}`);
  return healthService.calculate(asset);
}

// ✗ Bad
export default async function(s: any) {
  console.log("getting health");
  try {
    const a = await assetModel.findBySymbol(s);
    if (a) {
      return await healthService.calculate(a);
    }
  } catch (e) { }
}
```

**React (frontend only):**
- Functional components only — no class components.
- Use `@tanstack/react-query` for server state; avoid `useEffect` for data fetching.
- Keep component files focused on rendering; move logic into custom hooks.
- Use TailwindCSS utility classes; avoid inline `style` props.

### Rust (smart contracts)

- Run `cargo fmt` before committing — formatting is checked in CI.
- Address every `cargo clippy -- -D warnings` warning.
- Write doc comments (`///`) for all public functions.
- Minimise contract size — avoid heavy dependencies.
- Every public function must have a corresponding test.

```rust
/// Verifies that bridge reserves back the circulating supply.
///
/// # Arguments
/// * `env` - The contract execution environment
/// * `asset_id` - The asset identifier (e.g., `symbol_short!("USDC")`)
///
/// # Errors
/// Returns `Error::InsufficientReserves` if reserves < circulating supply.
pub fn verify_reserves(env: Env, asset_id: Symbol) -> Result<ReserveStatus, Error> {
    // implementation
}
```

### Database migrations

- Every migration **must** export both `up()` and `down()` functions.
- Use `npm run migrate:make -- <description>` to generate new files.
- Validate before committing: `npm run migrate:validate`.
- See [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) for the full workflow.

### Commit message format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body>

<optional footer — e.g. Closes #123>
```

**Types:** `feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore` · `perf` · `ci`

**Scopes:** `backend` · `frontend` · `contracts` · `api` · `bridge` · `price` · `health` · `ci` · `docs`

```bash
# Examples
feat(bridge): add reserve verification for USDC
fix(api): resolve race condition in price aggregation
docs: add migration guide
test(health): add unit tests for score calculation
ci: validate migration files before tests
```

Breaking changes must include a `BREAKING CHANGE:` footer:

```
feat(api)!: change health score range to 0–100

BREAKING CHANGE: Health scores previously ranged 0–10. All consumers
must update their thresholds accordingly.
```

---

## Secret Scanning and Credential Management

We use **Gitleaks** to automatically scan for secrets, private keys, and sensitive data in every pull request. This protects the security of Stellar bridge reserves, infrastructure, and user data.

### What Gitleaks scans for

Gitleaks detects:
- **Stellar seed phrases** (`S...` format, 56-character keys)
- **Private keys and API secrets** (AWS, Stripe, GitHub, Slack tokens)
- **Database credentials and connection strings**
- **JWT bearer tokens**
- **Blockchain private keys**

### Never commit

- Database passwords or connection strings
- API keys, tokens, or secret credentials
- Private keys (.pem, .key files)
- Seed phrases or mnemonic phrases
- SSH keys
- OAuth tokens or refresh tokens

### If Gitleaks flags your PR

The secret scanning workflow runs automatically on every PR. If secrets are detected:

1. **Stop immediately** — Do not push further commits with that secret
2. **Rotate the credential** — Invalidate the exposed secret in your infrastructure
3. **Remove the secret from git history**:
   ```bash
   # Option 1: Remove just the last commit (if not yet pushed)
   git reset --soft HEAD~1
   # Remove the secret from your code, then recommit
   
   # Option 2: Rewrite history with git-filter-repo (for pushed commits)
   pip install git-filter-repo
   git filter-repo --invert-mailmap --replace-text '${SECRET}==>${PLACEHOLDER}'
   git push --force-with-lease
   ```
4. **Re-run Gitleaks** to verify the secret is removed:
   ```bash
   gitleaks detect --source . --verbose
   ```
5. **Request a re-scan** by pushing a new commit to your PR

### Local secret scanning

Before pushing, scan your branch locally:

```bash
# Install Gitleaks (macOS)
brew install gitleaks

# Scan your uncommitted changes
gitleaks detect --source . --verbose

# Scan git history since main
gitleaks detect --source . --log-opts=main.. --verbose
```

### Best practices

- **Use environment variables** for secrets (never hardcode)
- **Keep `.env` files in `.gitignore`** — never commit them
- **Use GitHub Secrets** for CI/CD workflows
- **Rotate credentials regularly** — especially before public deployments
- **Review your commits before pushing** — `git diff main` to catch secrets

---

## Creating Issues

Good issues lead to good fixes. Please take two minutes to fill in the template completely.

### Bug reports

Use the **Bug Report** template. Include:

- **What you expected** vs **what actually happened**
- **Steps to reproduce** — the more precise, the faster the fix
- **Environment** — OS, Node version, browser (for frontend bugs)
- **Logs or screenshots** where relevant

> Before reporting: confirm you are on the latest `main` and the problem is reproducible.

### Feature requests

Use the **Feature Request** template. Include:

- **The problem you're solving** — not just what you want, but why
- **Your proposed solution** and any alternatives you considered
- **Scope** — is this a small addition or a large redesign?

### Change requests

For changes that don't fit as a simple bug report or feature request — architecture decisions, refactoring proposals, dependency upgrades, or process changes — use the [Change Request Form](.github/ISSUE_TEMPLATE/change_request.yml). It provides a structured template for documenting the problem, scope, impact, and approval status.

### Security vulnerabilities

**Do not open a public issue for security vulnerabilities.** Email **security@stellarbridgewatch.io** with details. We follow responsible disclosure — you'll receive a response within 48 hours and public credit once the fix is released (if you want it).

### Issue hygiene

- One issue per problem — don't bundle unrelated bugs.
- Search before opening — duplicates waste everyone's time.
- Respond to questions from maintainers — stale issues without responses are closed after 14 days.
- If you start working on an issue, comment to let others know.

---

## Pull Request Process

### Branch naming

| Purpose | Pattern | Example |
|---------|---------|---------|
| New feature | `feature/<short-description>` | `feature/governance-dashboard` |
| Bug fix | `bugfix/<short-description>` | `bugfix/price-feed-timeout` |
| Hot fix | `hotfix/<short-description>` | `hotfix/reserve-calculation` |
| Documentation | `docs/<short-description>` | `docs/migration-guide` |
| Release | `release/<version>` | `release/1.2.0` |

Always branch off `main`.

### Step-by-step

```bash
# 1. Update your fork
git fetch upstream && git checkout main && git merge upstream/main

# 2. Create a branch
git checkout -b feature/your-feature-name

# 3. Make changes, commit often
git add <files>
git commit -m "feat(scope): describe the change"

# 4. Run all local checks before pushing
cd backend
npm run lint
npm run migrate:validate   # if you added migrations
npm run test:unit
npm run build

# 5. Push to your fork
git push origin feature/your-feature-name

# 6. Open a PR against StellaBridge/Bridge-Watch main
```

### PR checklist

Before submitting, confirm:

- [ ] Branch is up to date with `main`
- [ ] All CI checks pass locally (lint, build, tests)
- [ ] New functionality has tests
- [ ] Documentation is updated (see [Documentation Requirements](#documentation-requirements))
- [ ] `BREAKING CHANGE` is noted in the commit footer if applicable
- [ ] PR title follows Conventional Commits format
- [ ] The PR description links the issue: `Closes #<number>`
- [ ] PR is scoped to one concern — unrelated changes belong in a separate PR

### Draft PRs

Open a **Draft PR** early if you want early feedback or want to signal that you are working on something. Convert it to "Ready for Review" when the checklist above is complete.

### Keeping your PR up to date

If `main` moves forward while your PR is open, rebase rather than merge:

```bash
git fetch upstream
git rebase upstream/main
git push origin feature/your-feature-name --force-with-lease
```

---

## Testing Requirements

All PRs that change behaviour must include tests. The bar varies by change type:

| Change type | Required tests |
|-------------|---------------|
| Bug fix | Regression test that would have caught the bug |
| New service / function | Unit tests covering the happy path and error cases |
| New API endpoint | Integration test for the route |
| New Soroban function | Unit test in the contract crate |
| Refactoring | Existing tests must continue to pass — no net loss of coverage |
| Documentation only | No tests required |

### Running tests

```bash
# Backend — unit (no database required)
cd backend && npm run test:unit

# Backend — integration (requires Docker services)
cd backend && npm run test:integration

# Backend — with coverage report
cd backend && npm run test:coverage

# Frontend
cd frontend && npm test

# Soroban contracts
cd contracts && cargo test
```

### Coverage expectations

- Target **≥ 80% line coverage** for new backend code.
- Coverage reports are uploaded to Codecov on every CI run.
- A drop in overall coverage without justification will be flagged in review.

### Writing good tests

- **Unit tests** — mock all external dependencies (database, Stellar API, Redis).
  Use the test factories in `backend/tests/factories/` to build realistic fixtures.
- **Integration tests** — use the helpers in `backend/tests/helpers/` to run
  migrations, truncate tables, and clean up after each test.
- **Fixture reference** — see [`docs/FIXTURE_AUDIT_REPORT.md`](docs/FIXTURE_AUDIT_REPORT.md)
  for the full inventory of shared fixtures, update process, and CI alignment.
- **Test names** should read as sentences: `it("returns 404 when asset is not found")`.
- Avoid testing implementation details — test observable behaviour.

```typescript
// ✓ Good — tests the contract, not the internals
it("returns the latest health score for a known asset", async () => {
  await createAsset({ symbol: "USDC" });
  await createHealthScore({ symbol: "USDC", composite_score: 85 });

  const response = await app.inject({ method: "GET", url: "/api/v1/assets/USDC/health" });

  expect(response.statusCode).toBe(200);
  expect(response.json().composite_score).toBe(85);
});
```

---

## Documentation Requirements

Good documentation is as important as good code. Update docs as part of the same PR — don't leave it for later.

### What to document

| Change | Documentation to update |
|--------|------------------------|
| New API endpoint | `backend/docs/API.md` and `backend/docs/openapi.json` |
| New npm / make command | `README.md` quick-reference table |
| New database migration | `docs/MIGRATION_GUIDE.md` (if a new pattern is introduced) |
| New environment variable | `.env.example` with a descriptive comment |
| New service or worker | Inline JSDoc on the class / public methods |
| New Soroban function | Rust doc comments (`///`) |
| Breaking change | Upgrade notes in `CHANGELOG.md` (or the PR description) |
| New setup step | `docs/DEVELOPMENT_SETUP.md` |

### Writing style

- **Audience-first:** assume the reader is a competent developer who is new to this project.
- **Active voice:** "Run `npm run migrate`" not "Migrations can be run using…"
- **Show, don't tell:** prefer short code examples over long prose.
- **Headers and lists:** make documents skimmable — not everyone reads top to bottom.
- **Links:** cross-reference related documents rather than duplicating content.

---

## Review Process

### What to expect

| Step | Timeline |
|------|---------|
| First acknowledgement | Within **2 business days** |
| Full review | Within **5 business days** |
| Follow-up rounds | Within **2 business days** per round |

If your PR has had no activity after 5 business days, leave a comment to bump it — we don't want work to go unnoticed.

### What reviewers look at

Reviewers check PRs against these criteria:

1. **Correctness** — Does the code do what it claims? Are edge cases handled?
2. **Tests** — Is the new behaviour covered? Would the tests catch a regression?
3. **Security** — No injection vulnerabilities, no leaked secrets, no unvalidated inputs at system boundaries.
4. **Performance** — No obviously expensive operations in hot paths; TimescaleDB queries use indexed columns.
5. **Consistency** — Does the change fit the existing architecture and naming conventions?
6. **Documentation** — Are changes reflected in relevant docs?

### Responding to review comments

- Treat all review feedback as collaborative, not personal.
- Respond to every comment — either make the change, or explain why you disagree.
- Use the GitHub **"Resolve conversation"** button after addressing a comment.
- If a discussion is going in circles, suggest taking it to a GitHub Discussion or a quick call.
- Avoid force-pushing after a review has started (it loses comment context) — add new commits instead.

### Approval and merge

- **1 approval** is required to merge a regular PR.
- **2 approvals** are required for changes to CI/CD workflows, security-sensitive code, or database schema.
- Only maintainers can merge to `main`.
- PRs are merged using **squash merge** to keep `main` history clean; your commit messages become the squash body.

---

## Release Process

Bridge Watch uses [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

| Version bump | When |
|--------------|------|
| `PATCH` (0.1.**1**) | Backwards-compatible bug fixes |
| `MINOR` (0.**2**.0) | New backwards-compatible features |
| `MAJOR` (**1**.0.0) | Breaking changes |

### Release cadence

- **Patch releases** are cut as needed when critical fixes land on `main`.
- **Minor releases** are planned roughly monthly, batching features that are ready.
- **Major releases** are announced in advance with a migration guide.

### How a release works

1. A maintainer creates a `release/X.Y.Z` branch from `main`.
2. The `CHANGELOG.md` is updated — entries are written from merged PR titles.
3. The version in `backend/package.json` and `frontend/package.json` is bumped.
4. A PR is opened from the release branch into `main`.
5. After the PR is merged, the maintainer tags the commit: `git tag vX.Y.Z`.
6. The `release.yml` workflow automatically builds Docker images and publishes a GitHub Release.

Contributors do not need to manage releases — just make sure your PR title is a clear Conventional Commit so it generates a good changelog entry.

---

## Communication Channels

| Channel | Purpose |
|---------|---------|
| [GitHub Issues](https://github.com/StellaBridge/Bridge-Watch/issues) | Bug reports, feature requests, tasks |
| [GitHub Discussions](https://github.com/StellaBridge/Bridge-Watch/discussions) | Questions, ideas, general conversation |
| **security@stellarbridgewatch.io** | Security vulnerability reports (private) |

### Guidelines for communication

- **Be specific.** "This doesn't work" is hard to act on; "The `/api/v1/assets` endpoint returns 500 when `symbol` is omitted" is actionable.
- **Be patient.** Maintainers are volunteers — response times vary.
- **Be kind.** Assume good intent. We're all here because we care about the Stellar ecosystem.
- **Stay on topic.** Keep GitHub Issues focused on the project.

### Getting help

If you're stuck setting up the project, the best place to ask is a
[GitHub Discussion](https://github.com/StellaBridge/Bridge-Watch/discussions) — other community members may have encountered the same issue.

---

## Recognising Contributors

Every contribution matters and we want to make sure contributors feel seen.

### How we recognise contributions

- **`README.md` contributors section** — All contributors are listed (code, docs, design, community — everything counts).
- **Release notes** — Every merged PR is credited by GitHub username in the release changelog.
- **`good first issue` label** — Issues solved by first-time contributors are highlighted in the release notes.

### All-Contributors

We use the [All Contributors](https://allcontributors.org/) specification to recognise every type of contribution — not just code. When your first PR merges, a maintainer will add you to the contributors table with the appropriate emoji badges.

### Becoming a maintainer

Regular contributors who demonstrate good judgement in code and in community interactions may be invited to become maintainers. Maintainers can approve and merge PRs, manage issues, and help shape the project roadmap. There's no formal application process — sustained, quality contribution is the path.

---

## Quick Reference

```bash
# Start dev environment
make dev

# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Run unit tests
cd backend && npm run test:unit

# Run linters
cd backend && npm run lint
cd contracts && cargo clippy -- -D warnings
cd contracts && cargo fmt --check

# Generate a new migration file
npm run migrate:make -- <name>

# Validate migration files
npm run migrate:validate
```

---

*Thank you for contributing to Stellar Bridge Watch. Every pull request, every bug report, every documentation improvement makes the Stellar ecosystem a little bit better.* 🌟
