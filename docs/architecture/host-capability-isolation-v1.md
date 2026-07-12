# Host Capability Isolation v1

- Status: Ungranted file/socket/clock/device classes proven unreachable
- Last updated: 2026-07-12
- Plan item: `P04-014`
- Machine authority: [`helix.host-capability-isolation/1`](host-capability-isolation-v1.json)

The portable browser core still has zero WebAssembly imports and the deterministic Rust boundary
rejects ambient filesystem, network, time, and device APIs/dependencies. Therefore it has no direct
route to any external resource. Native and browser policies independently deny exact ungranted
file, networking/socket, timer/clock, and GPU/device scopes.

ABI 7 exposes file and clock operations only behind explicit capability resources. It does not yet
define socket or GPU device operations at all, so those classes cannot be reached even with a
descriptor. Chromium, Firefox, and WebKit execute the zero-import and four-denial browser proof;
the native Rust suite executes the same four policy classes.

## Claim boundary

This proves reachability isolation for the current portable core and host skeletons. It does not
claim platform storage, socket, or GPU adapters, linked Component Model execution, authorization
beyond exact development grants, or database functionality.

```bash
corepack npm run host:isolation:check
corepack npm run host:isolation:test
corepack npm run browser:smoke
```
