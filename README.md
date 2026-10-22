# Stellar Bridge Watch

## Overview

Stellar Bridge Watch is an open-source monitoring platform for cross-chain asset bridges, decentralized exchange liquidity, and bridged asset health on the Stellar network. It provides real-time analytics, automated alerts, and transparent reporting designed for developers, traders, and institutions operating within the Stellar ecosystem.

As institutional adoption accelerates and real-world assets continue to grow on Stellar, the need for reliable and transparent bridge monitoring infrastructure has become critical. This project aims to fill that gap.

> Project Status: Early development -- contributions and feedback are welcome.


## Mission

To provide the Stellar ecosystem with transparent, reliable, and open-source monitoring infrastructure that strengthens trust in cross-chain bridges and improves liquidity visibility across decentralized exchanges.


## Problem Statement

The Stellar network is experiencing rapid growth in bridged assets and tokenized real-world assets. USDC on Stellar has surpassed $83M in supply with over $4.2B in payment volume, PYUSD launched with access to hundreds of millions of users, and RWA activity grew 172% year-over-year. Despite this progress, several challenges remain unaddressed:

- No unified tool exists to monitor the health and integrity of cross-chain bridges bringing assets to Stellar
- Multiple DEXs (StellarX, Phoenix, LumenSwap, Soroswap, and the native SDEX) fragment liquidity with no aggregated view
- Off-chain and on-chain prices can diverge significantly without automated detection
- As bridge TVL grows, real-time monitoring becomes essential for detecting anomalies and potential exploits
- Enterprises need transparent analytics and health metrics for compliance and risk management

Stellar Bridge Watch solves this by providing a unified monitoring and analytics layer purpose-built for Stellar.


## Vision

To become the standard monitoring infrastructure for bridged assets on Stellar, enabling:

- Greater confidence in bridge security and asset integrity
- Transparent, real-time visibility into cross-chain asset flows
- Aggregated liquidity intelligence across all major Stellar DEXs
- A public foundation that developers and institutions can build on


## Target Users

- DeFi developers building on Stellar and Soroban
- Institutional asset managers and treasury operators
- Traders seeking aggregated liquidity and pricing data
- Bridge operators requiring health and uptime monitoring
- Compliance teams needing transparent audit trails
- Open-source contributors interested in Stellar infrastructure


## Core Features

### Bridge Integrity Monitoring

Continuous tracking of bridged asset supplies across chains with automated verification against official reserve data. This includes monitoring mint and burn events, detecting supply mismatches, and maintaining historical records of bridge performance and uptime.

### On-Chain Bridge Status Aggregation (Soroban)

The Soroban contract maintains **pre-aggregated rollups** for fast reads (no scanning across all assets/bridges at query time). Rollups are normalized into severity tiers:

`StatusTier`: `Ok` | `Low` | `Medium` | `High`

Stored rollup views:

- **Per-asset**: `AssetStatusRollup` (health score + price deviation alerts + paused/active flags)
- **Per-bridge**: `BridgeStatusRollup` (latest supply mismatch severity)
- **Contract-level**: `ContractStatusRollup` (counts by tier across assets and bridges, plus an overall tier)

Read functions (Soroban):

- `get_asset_status_rollup(asset_code)`
- `get_bridge_status_rollup(bridge_id)`
- `get_contract_status_rollup()`

Rollups are updated deterministically when new signals are submitted (for example, `submit_health`, `check_price_deviation`, and `record_supply_mismatch`).

Events:

- `asset_st` — asset tier updated
- `bridge_st` — bridge tier updated
- `ctr_st` — contract-level tier updated

### Liquidity Analytics

Aggregated liquidity depth across StellarX AMM, Phoenix DEX, LumenSwap, SDEX, and Soroswap. The platform provides real-time total value locked per asset pair, best route suggestions for optimal trade execution, and volume-weighted average pricing across all venues.

### Price Oracle System

Multi-source price aggregation from Stellar DEX, Circle API, and major exchanges. Automated deviation alerts trigger when prices diverge beyond configurable thresholds. Historical price data, impact calculators, and arbitrage comparison tools are included.

### Asset Health Dashboard

Composite health scores (0-100) for each monitored asset based on liquidity depth and distribution, price stability, bridge uptime and reliability, reserve backing verification, and transaction volume trends. Each factor is broken down with trending analysis to surface improving or deteriorating conditions.

### Analytics and Reporting

Daily, weekly, and monthly bridge volume statistics. Cross-chain flow visualization showing which assets are flowing in and out of Stellar. Institutional asset tracking covering Franklin Templeton FOBXX, Ondo USDY, Centrifuge tokens, and others. Export functionality supports custom report generation.


## Architecture

The project is structured around five core layers:

- **Data Collection** -- Stellar Horizon API and Soroban RPC for on-chain data, Ethereum RPC for bridge contract verification, DEX-specific APIs, and external data sources including Circle and exchange APIs
- **Processing Engine** -- Real-time event processing for bridge transactions, scheduled health checks, alert evaluation with configurable thresholds, and data normalization pipelines
- **Storage** -- PostgreSQL with TimescaleDB for time-series data, Redis for caching, and automated archival for historical retention
- **API Layer** -- RESTful endpoints for synchronous queries, WebSocket connections for real-time updates, rate limiting, authentication, and comprehensive documentation
- **Frontend** -- Responsive web dashboard with interactive charts, customizable alert preferences, and mobile-friendly design

### Technology Stack

**Backend:** Node.js 20+ with TypeScript, Express.js or Fastify, PostgreSQL 15+ with TimescaleDB, Redis 7+, Bull for job scheduling

**Blockchain Integration:** Stellar SDK (@stellar/stellar-sdk), Horizon API for Classic transactions, Soroban RPC for smart contract interactions, Ethers.js for Ethereum bridge contracts

**Frontend:** React 18 with TypeScript, TailwindCSS, Recharts for data visualization, React Query for server state management

**Smart Contracts:** Soroban (Rust) for on-chain monitoring components, oracle integrations, and DeFi protocol interactions

**Infrastructure:** Docker and Docker Compose for containerization, GitHub Actions for CI/CD


## Repository Structure

```
stellar-bridge-watch/
├── contracts/
│   └── soroban/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   ├── services/
│   │   ├── workers/
│   │   ├── database/
│   │   ├── utils/
│   │   └── config/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── services/
│   └── public/
├── sdk/
│   ├── src/
│   └── examples/
├── docs/
├── scripts/
├── .github/
│   └── workflows/
├── docker-compose.yml
├── README.md
└── LICENSE
```


## Quick Start

### Standard Setup

```bash
# Clone the repository
git clone https://github.com/StellaBridge/Bridge-Watch.git
cd Bridge-Watch

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Start services with Docker Compose
docker-compose up -d

# Run the development server
npm run dev
```

### Local Sandbox (for Contract Development)

If you're developing Soroban smart contracts, you can spin up a local Stellar network with deployed contracts using a single command:

```bash
# Start local Soroban sandbox with contracts deployed
npm run sandbox:start
```

This command will:
1. Check prerequisites (Docker, soroban-cli, Rust toolchain)
2. Start a local Stellar Quickstart container with Soroban RPC
3. Compile all contracts to WASM
4. Deploy contracts to the local network
5. Generate and fund test accounts
6. Initialize contract state with mock data

**Prerequisites:**
- Docker (running)
- [soroban-cli](https://soroban.stellar.org/docs/getting-started/setup) — `cargo install --locked soroban-cli`
- Rust toolchain — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- wasm32-unknown-unknown target — `rustup target add wasm32-unknown-unknown`

**Generated Files:**
- `.env.sandbox` — Contains deployed contract addresses and test account public keys (gitignored)
- Private keys are managed by soroban-cli in `~/.config/soroban/identity/`

**Network Endpoints:**
- RPC: `http://127.0.0.1:8000/soroban/rpc`
- Horizon: `http://127.0.0.1:8000`

**Test Accounts:** admin, operator, test_user, treasury (all funded via friendbot)

**Companion Commands:**
```bash
npm run sandbox:stop    # Stop the sandbox
npm run sandbox:reset   # Reset to clean state
npm run sandbox:logs    # View container logs
```

**Example Usage:**
```bash
# Invoke a contract function
soroban contract invoke \
  --id <CONTRACT_ID_FROM_.env.sandbox> \
  --source-account admin \
  --rpc-url http://127.0.0.1:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017" \
  -- \
  get_health \
  --asset_code "USDC"
```

**Troubleshooting:**
- **Container fails to start:** Check Docker daemon with `docker info`
- **Compilation fails:** Verify Rust toolchain version with `cargo --version` and ensure wasm target is installed
- **Deployment fails:** Check container health with `docker logs bridge-watch-soroban-sandbox`
- **Reset state:** Run `npm run sandbox:reset` to start fresh

## Docker Development Environment

The project includes a comprehensive Docker Compose configuration for local development with all services pre-configured with health checks and data persistence.

### Architecture

The development stack includes:
- **PostgreSQL + TimescaleDB** — Primary database with health checks (`pg_isready`) and named volume persistence
- **Redis** — Caching layer with health checks (`redis-cli ping`) and data persistence
- **Backend** — Node.js/TypeScript API with hot reload, depends on healthy PostgreSQL and Redis
- **Frontend** — Vite/React with HMR, depends on backend
- **PgAdmin 4** — Database management UI at `http://localhost:5050`
- **Redis Commander** — Redis management UI at `http://localhost:8081`

### Quick Start with Docker

```bash
# Start all services in background
docker compose -f docker-compose.dev.yml up -d

# View logs for all services
docker compose -f docker-compose.dev.yml logs -f

# View logs for specific service
docker compose -f docker-compose.dev.yml logs -f backend

# Check service health status
docker compose -f docker-compose.dev.yml ps

# Stop and remove containers (preserves volumes)
docker compose -f docker-compose.dev.yml down

# Stop and remove containers + volumes (full reset)
docker compose -f docker-compose.dev.yml down -v
```

### Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | Vite dev server with HMR |
| Backend API | http://localhost:3001 | REST API & WebSocket |
| Backend Health | http://localhost:3001/health | Health check endpoint |
| PgAdmin 4 | http://localhost:5050 | Database management UI |
| Redis Commander | http://localhost:8081 | Redis management UI |
| PostgreSQL | localhost:5432 | Direct database access |
| Redis | localhost:6379 | Direct Redis access |

### Health Checks

All services include health checks:
- **PostgreSQL**: `pg_isready` every 10s
- **Redis**: `redis-cli ping` every 10s
- **Backend**: `wget` to `/health` every 30s
- **Frontend**: `wget` to root every 30s
- **PgAdmin**: `wget` to `/misc/ping` every 30s
- **Redis Commander**: `wget` to root every 30s

Services use `depends_on` with `condition: service_healthy` to ensure proper startup order.

### Data Persistence

Named volumes ensure data survives container restarts:
- `postgres_data` — PostgreSQL data directory
- `redis_data` — Redis data directory
- `pgadmin_data` — PgAdmin configuration
- `backend_node_modules` — Isolated node_modules for hot reload
- `frontend_node_modules` — Isolated node_modules for hot reload

To reset all data: `docker compose -f docker-compose.dev.yml down -v`

### Using Make Commands

```bash
make dev        # Start development environment (docker compose up -d)
make dev-logs   # View all logs
make dev-down   # Stop containers (preserves volumes)
make dev-clean  # Stop and remove everything including volumes
```

### Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Key variables for Docker:
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — Database credentials
- `POSTGRES_PORT` — Database port (default: 5432)
- `REDIS_PORT` — Redis port (default: 6379)
- `PORT` — Backend port (default: 3001)
- `WS_PORT` — WebSocket port (default: 3002)
- `FRONTEND_PORT` — Frontend port (default: 5173)
- `PGADMIN_EMAIL`, `PGADMIN_PASSWORD` — PgAdmin credentials
- `REDIS_PASSWORD` — Redis password (optional)
- `REDIS_COMMANDER_USER`, `REDIS_COMMANDER_PASSWORD` — Redis Commander credentials

See `.env.example` for all available options.

## API Endpoints (MVP)

```
GET  /api/v1/assets                    # List all monitored assets
GET  /api/v1/assets/:symbol            # Detailed asset information
GET  /api/v1/assets/:symbol/health     # Current health score
GET  /api/v1/assets/:symbol/liquidity  # Aggregated liquidity data
GET  /api/v1/assets/:symbol/price      # Current price from all sources
GET  /api/v1/bridges                   # Bridge status overview
GET  /api/v1/bridges/:bridge/stats     # Bridge-specific statistics
WS   /api/v1/ws                        # WebSocket for real-time updates
```

## Feature Documentation

- Build cache matrix: [docs/build-cache-matrix.md](docs/build-cache-matrix.md)
- Support handbook: [docs/support-handbook.md](docs/support-handbook.md)
- Migration notes template: [docs/migration-notes-template.md](docs/migration-notes-template.md)
- API authentication guide: [docs/api-authentication-guide.md](docs/api-authentication-guide.md)
- Time range selector API: [docs/time-range-selector-api.md](docs/time-range-selector-api.md)
- Watchlist feature: [docs/watchlist-feature.md](docs/watchlist-feature.md)
- Visualization color system: [docs/data-visualization-color-system.md](docs/data-visualization-color-system.md)
- Contract integration SDK: [sdk/README.md](sdk/README.md)
- Export picker flow: [docs/user-guide/export-picker-flow.md](docs/user-guide/export-picker-flow.md)


## Roadmap

### Phase 1 -- MVP

- Monitor 5 core assets: USDC, PYUSD, EURC, XLM, Franklin Templeton FOBXX
- Basic bridge health monitoring with supply tracking
- Price aggregation from 3 sources (Stellar DEX, Circle, Coinbase)
- Simple health scoring based on liquidity and price stability
- Web dashboard with essential charts
- Public REST API with core endpoints
- Docker deployment configuration

### Phase 2 -- Enhanced Analytics

- Expand to 10+ monitored assets covering all major bridged assets
- Full multi-DEX liquidity aggregation
- Advanced health scoring with additional factors
- Historical data analysis and trending
- Webhook support for external integrations
- Performance optimizations

### Phase 3 -- Soroban Integration

- Monitor Soroban-based DeFi protocols using bridged assets
- Track smart contract interactions with bridges
- Liquidity pool analytics for Soroban DEXs
- Contract upgrade monitoring
- Security event detection

### Phase 4 -- Advanced Features

- Mobile-responsive progressive web app
- Machine learning-based anomaly detection
- Advanced visualization options
- Custom alert rules and notification channels
- Multi-chain expansion beyond Ethereum bridges


## Initial Asset Coverage

**Phase 1 Priority:**
USDC (Circle), PYUSD (PayPal), EURC (Circle), XLM (Native), FOBXX (Franklin Templeton)

**Phase 2 Expansion:**
USDY (Ondo Finance), Centrifuge RWA tokens, Wormhole-bridged assets, additional stablecoins


## Expected Impact

When fully developed, Stellar Bridge Watch will:

- Provide critical monitoring infrastructure as Stellar targets top-10 DeFi TVL
- Support the ecosystem goal of scaling yield-bearing RWAs
- Enhance security and transparency for institutional adoption
- Reduce the barrier to entry for developers who need reliable bridge and liquidity data
- Serve as a public good and open foundation for the Stellar community


## Success Metrics

- Monitor 20+ bridged assets within 6 months
- Achieve sub-second latency for price updates
- 99.9% uptime for monitoring services
- 500+ GitHub stars within the first year
- 50+ active API users and integrations
- Community contributions from 10+ developers
- Featured in Stellar ecosystem documentation


## Contributing

We welcome contributions from the community.

Ways to contribute:

- Implement new monitoring modules or integrations
- Improve documentation and examples
- Build Soroban smart contract components
- Report bugs or suggest features
- Review and test pull requests

Please review the contribution guidelines before submitting a pull request.


## Maintainer Commitment

This project is actively maintained with the goal of long-term ecosystem support. We are committed to clear documentation, responsive issue management, and a stable development process. Major decisions will be discussed openly and community input will be valued throughout the project lifecycle.


## License

MIT License


## Community and Support

If you are building on Stellar and want to collaborate:

- Open an issue
- Start a discussion
- Submit a pull request

Together, we can build the monitoring infrastructure the Stellar ecosystem needs.
