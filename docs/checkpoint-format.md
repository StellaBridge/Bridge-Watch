# Checkpoint Format

Bridge Watch checkpoints store a bounded history of contract state snapshots for historical analysis, comparison, and restore.

## Stored Components

- `CheckpointConfig`: global interval, retention limit, and format version.
- `CheckpointMetadata`: compact index used for listing and querying checkpoints.
- `CheckpointSnapshot`: full state payload keyed by checkpoint id.

## Metadata Fields

- `checkpoint_id`: monotonically increasing identifier.
- `format_version`: schema version for checkpoint payload compatibility.
- `created_at`: ledger timestamp when the checkpoint was created.
- `trigger`: `Automatic`, `Manual`, or `Restore`.
- `created_by`: address that initiated the checkpoint.
- `label`: operator-supplied or system-generated description.
- `monitored_asset_count`: number of monitored asset ids in the snapshot.
- `asset_count`: number of per-asset state entries stored in the snapshot.
- `state_hash`: SHA-256 hash of the serialized snapshot payload for validation.
- `restored_from`: source checkpoint id when the checkpoint was created by a restore action.

## Snapshot Payload

Each `CheckpointSnapshot` contains:

- The same id/version/timestamp/trigger metadata needed for replay safety.
- The raw `MonitoredAssets` list used by the contract.
- Current `HealthWeights`.
- A `CheckpointAssetState` entry per monitored asset including:
  - `AssetHealth`
  - latest `PriceRecord` if present
  - latest `HealthScoreResult` if present

## Retention and Pruning

- Automatic checkpoints are created only when the configured interval has elapsed since the last checkpoint.
- Manual checkpoints bypass the interval check.
- The contract prunes the oldest snapshots once `max_checkpoints` is exceeded.
- Metadata is stored separately from full snapshots so history queries can avoid loading every payload.

## Restore Semantics

- Restoring a checkpoint rewrites `MonitoredAssets`, `HealthWeights`, `AssetHealth`, `PriceRecord`, and `HealthScoreResult` to the stored snapshot values.
- Assets present in current state but absent from the restored snapshot are removed from the checkpoint-managed state keys.
- Every restore operation creates a new `Restore` checkpoint to preserve an audit trail.
