# Bridge Transaction Monitoring

This document describes the new bridge transaction monitoring feature for `Stellar Bridge Watch`.

## Purpose

The bridge transaction monitor provides:

- Tracking of cross-chain bridge mint and burn transactions
- Pending transaction status and confirmation updates
- Failed transaction detection and error recording
- Transaction volume metrics and confirmation timing analysis
- Real-time broadcast of transaction changes through WebSocket

## Database schema

A new table was added: `bridge_transactions`.

Columns include:

- `bridge_name`
- `symbol`
- `transaction_type`
- `status`
- `tx_hash`
- `amount`
- `fee`
- `submitted_at`
- `confirmed_at`
- `failed_at`
- `error_message`
- `correlation_id`

## API endpoints

- `GET /api/v1/bridges/:bridge/transactions`
- `GET /api/v1/bridges/:bridge/transactions/:txHash`
- `POST /api/v1/bridges/:bridge/transactions`
- `PATCH /api/v1/bridges/:bridge/transactions/:txHash/status`
- `GET /api/v1/bridges/:bridge/transactions/metrics`

These endpoints allow insertion, lookup, status updates, and summary metrics for bridge transactions.

## Real-time updates

Transaction state changes publish a WebSocket event on topic `bridge.<bridge_name>` with type `transaction_update`.
