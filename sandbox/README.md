# Bridge Watch - Local Sandbox

The sandbox lets contributors run representative workflows without external dependencies
(Stellar RPC, Ethereum RPC, Circle API, etc.).

## Quick Start

```bash
# From the project root
npm run sandbox
```

This will:

1. Set environment variables for sandbox mode
2. Start a local PostgreSQL and Redis via Docker Compose
3. Run database migrations with deterministic seed data
4. Start the backend with mock service overrides
5. Start the frontend in development mode

## What the Sandbox Provides

### Mock Services

All external API calls are intercepted with deterministic responses:

- **Stellar Horizon** - Mocked price and account data
- **Soroban RPC** - Mocked contract interactions
- **Circle API** - Mocked USDC mint/burn data
- **Coinbase API** - Mocked price feeds

### Deterministic Data

The seed script (`sandbox/seed.ts`) populates the database with:

- 5 monitored assets (USDC, EURC, AQUA, yUSDC, BTC)
- 3 bridges (Circle, Wormhole, Stellar Bridge)
- 30 days of historical price data
- 7 days of health scores
- Sample alert rules and events
- Incident history for heatmap

### Reset Support

```bash
npm run sandbox:reset
```

Drops and recreates all database tables, then re-seeds with deterministic data.
Useful when you need a clean state.

## Architecture

```
sandbox/
  seed.ts           # Deterministic data seeder
  mockServices.ts   # Mock service implementations
  README.md         # This file
```

The sandbox leverages:

- `sandbox:env` script in the root `package.json` to set `NODE_ENV=sandbox`
- `backend/src/config/index.ts` recognizes `sandbox` as a valid environment
- Mock services are wired in `sandbox/mockServices.ts` and loaded conditionally
