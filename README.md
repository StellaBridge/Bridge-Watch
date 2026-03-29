# Stellar Bridge Watch

[![CI](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/ci.yml/badge.svg)](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/ci.yml)
[![Security](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/security.yml/badge.svg)](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/security.yml)
[![Deploy](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/deploy.yml/badge.svg)](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/deploy.yml)
[![Code Quality](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/code-quality.yml/badge.svg)](https://github.com/StellaBridge/Bridge-Watch/actions/workflows/code-quality.yml)

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
│   ├── Cargo.toml          # workspace (soroban + transfer_state_machine)
│   ├── soroban/            # Bridge Watch main Soroban package
│   └── transfer_state_machine/  # bridge transfer lifecycle state machine (#16)
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
├── docs/
├── scripts/
├── .github/
│   └── workflows/
├── docker-compose.yml
├── README.md
└── LICENSE
```

## Quick Start

### Automated Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/StellaBridge/Bridge-Watch.git
cd Bridge-Watch

# Run the setup script — handles everything
./scripts/setup.sh

# Start the full dev environment
make dev
```

The setup script checks prerequisites, installs dependencies, configures `.env`, starts Docker services (PostgreSQL + Redis), runs database migrations and seeds, builds Soroban contracts, and generates IDE configuration. Run `./scripts/setup.sh --help` for all options.

See [docs/DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md) for detailed setup documentation, manual steps, and troubleshooting.

### Manual Setup

```bash
git clone https://github.com/StellaBridge/Bridge-Watch.git
cd Bridge-Watch
cp .env.example .env
npm install
docker compose -f docker-compose.dev.yml up -d postgres redis
npm run migrate --workspace=backend
npm run seed --workspace=backend
make dev
```

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

## Load Testing

Bridge-Watch includes a k6-based load testing framework with scenario profiles for smoke, ramp-up, spike, and endurance testing.

- Framework entry point: [load-tests/README.md](load-tests/README.md)
- Methodology: [docs/load-testing-methodology.md](docs/load-testing-methodology.md)
- Baselines: [docs/performance-baselines.md](docs/performance-baselines.md)

Run a local smoke test (requires k6 installed):

```bash
npm run test:load
```

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

## Clipboard Utilities

The frontend clipboard API and usage examples are documented in `docs/copy-clipboard.md`.

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
