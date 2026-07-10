# P01-021 Post-Commit Storage-Bounds Failure

- Status: Failed evidence attempt; superseded
- Observed at: 2026-07-10T22:13:40Z
- Initial artifact commit: `26b0b2634f6988ed9b9ae362d7239ec6e78423bd`
- Evidence commit invalidated by this replay: `b7c62f0b5a28b7f6fda05b696b4a235827a113f1`
- Corrective commit: `e68d50a`
- Result: Infrastructure failure; semantic comparison did not run to completion

## Failure

The post-commit execution of `node evidence/phase-01/P01-021/verify.mjs 26b0b2634f6988ed9b9ae362d7239ec6e78423bd` reproduced both normal environment-profile checks but failed while the live expectation canary inserted the six-document dataset.

The durable diagnostic was:

```text
MongoBulkWriteError: 28: No space left on device
WiredTiger ... pwrite: failed to write 4096 bytes at offset 0
/data/db/collection-*.wt
```

The runner collected MongoDB logs before removing the failed container. Those logs proved `diagnosticDataCollectionEnabled=false` was applied, so this was distinct from the earlier FTDC termination. WiredTiger startup metadata, journal/storage allocation, and the first test collection could exceed the 256 MiB data tmpfs. The 512 MiB container memory limit also left insufficient margin for the tmpfs plus the minimum 256 MiB WiredTiger cache.

No differential result was accepted from this attempt. The runner's `finally` cleanup removed the isolated database/container, and no `helix-p01-021` container remained.

## Disposition

Corrective commit `e68d50a`:

- bumps the harness from 1.0.0 to 1.0.1;
- increases the bounded data tmpfs from 256 MiB to 512 MiB;
- increases the container memory limit from 512 MiB to 1 GiB;
- pins the WiredTiger cache at 0.25 GiB;
- disables journaling because this profile tests query semantics, not durability;
- retains disabled FTDC, read-only root, unprivileged UID/GID, dropped capabilities, loopback-only random port, timeouts, and explicit cleanup; and
- regenerates every case-hash-bound observation/report artifact and documentation identity.

The logical dataset, queries, upstream rows, 12 exact/four different relations, and zero-skip verdict did not change. Harness 1.0.1 subsequently passed 20 consecutive live startup/insert/query/cleanup replays, including 10 under alternating timezone/locale profiles, before the superseding immutable evidence replay.
