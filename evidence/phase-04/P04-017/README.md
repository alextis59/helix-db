# P04-017 Evidence

This bundle proves that source commit `9341b049af4867229159769d98d16594197c712c` completed
`EXP-003`, selected coarse bounded explicit copy as the initial ABI 7 host transport, and recorded
quantitative triggers and acceptance thresholds for revisiting that decision.

Run the verifier from the repository root:

```bash
node evidence/phase-04/P04-017/verify.mjs 9341b049af4867229159769d98d16594197c712c
```

The verifier reads the authorities from the exact source commit. It rejects a different commit,
source tree, diff, authority hash, benchmark report, decision, threshold, claim boundary, or CI
history. The evidence does not claim zero copy, mapped/shared memory, linked production native ABI
calls, platform storage, or database functionality.
