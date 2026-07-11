# WGSL Fixture Parsing, Validation, and Compilation

- Status: Accepted foundation validator; no GPU runtime or product kernel exists
- Last updated: 2026-07-11
- Owner: GPU architecture owner with quality and security review
- Plan item: `P02-011`
- Governing gate: `G02`
- Fixture authority: [`helix.wgsl-fixtures/1`](../../shaders/fixtures/manifest.json)
- Validation entry point: [`check-wgsl-fixtures.mjs`](../../tests/toolchain/check-wgsl-fixtures.mjs)
- CI authority: [`helix.ci-matrix/2`](../../.github/ci/matrix.json)

## Decision and scope

Foundation CI parses and validates repository-owned WGSL with the Dawn implementation bundled in
the exact Playwright Chromium revision, using Chromium's bundled SwiftShader adapter. Accepted
fixtures must create an asynchronous compute pipeline. Deliberately invalid fixtures must produce
shader compilation diagnostics, a validation error, and pipeline rejection.

This adds no Rust or npm dependency: `@playwright/test` 1.61.1 and its coupled Chromium revision
were already pinned for browser bundle smoke testing. The validator follows the normative
[WGSL specification](https://www.w3.org/TR/WGSL/) through the actual browser WebGPU API rather
than maintaining a repository-local grammar approximation.

The operation stops at pipeline creation. It creates no input/output buffer, command encoder,
queue submission, timestamp, or result comparison. Therefore it proves only that pinned Dawn
accepts or rejects the reviewed source as expected and can compile the accepted compute entry
points. Runtime dispatch, CPU/GPU equivalence, device capability policy, caching, loss recovery,
fallback, quotas, performance, and product support remain Phase 10 and Phase 11 obligations.

## Versioned fixture contract

`shaders/fixtures/manifest.json` is the sole bootstrap fixture authority. Its schema records:

- a stable fixture ID and repository-relative source path;
- the exact source SHA-256 digest;
- compute stage and `main` entry point;
- a narrow test purpose;
- whether the fixture must be accepted or rejected; and
- required diagnostic substrings for deliberate failures.

The browser-free `npm run wgsl:check` command rejects unknown schema/task/validator identities,
field drift, duplicate IDs/paths/purposes, path traversal, source symlinks, unlisted `.wgsl` files,
non-UTF-8 or non-LF text, missing terminal newlines, sources larger than 16 KiB, digest mismatch,
and any change to the two-accept/two-reject bootstrap coverage. Source and expectation changes are
reviewed together; silently updating a hash to make a modified fixture pass is not sufficient
review.

The initial fixtures cover four distinct compiler boundaries:

| Fixture purpose | Expected result | What it exercises |
| --- | --- | --- |
| Minimal compute pipeline | Accept | Compute attribute, workgroup declaration, entry-point compilation |
| Storage resource layout | Accept | Uniform/read/read-write storage bindings and auto pipeline layout |
| Syntax rejection | Reject | Malformed function declaration and location-bearing error diagnostic |
| Resource-binding rejection | Reject | Conflicting live bindings plus primary and explanatory diagnostics |

These sources live under `shaders/fixtures/`, not `shaders/predicates/`, `shaders/bitmaps/`, or
`shaders/vectors/`, because they are compiler canaries rather than implementation kernels.
Versioned product kernel metadata, feature/limit requirements, exactness class, workgroup
assumptions, CPU references, and test vectors remain owned by `P10-004`.

## Runtime validation sequence

`npm run wgsl:validate` performs the following fail-closed sequence:

1. Re-run every manifest and source-integrity assertion before launching a browser.
2. Bind an ephemeral HTTP server to `127.0.0.1`; serve one inert HTML document with a deny-by-default
   content security policy and an explicit same-origin WebGPU permissions policy.
3. Launch the locked Chromium headlessly with the reviewed WebGPU, Dawn validation, and
   `--use-webgpu-adapter=swiftshader` flags.
4. Require a secure loopback context, `navigator.gpu`, a device, and the expected Google
   SwiftShader adapter identity (`swiftshader`, device `0xc0de`, Subzero description).
5. For each accepted fixture, call `createShaderModule()`, inspect `getCompilationInfo()`, and call
   `createComputePipelineAsync()`; require no diagnostic, rejection, or validation error.
6. For each rejected fixture, require at least one error diagnostic, failed pipeline creation, a
   captured validation error, and all manifest diagnostic markers.
7. Require no browser console/page/request failures and no uncaptured WebGPU errors, destroy the
   device, close Chromium, and close the loopback server even on failure.

The use of compilation information, error scopes, and asynchronous pipeline creation makes both
positive and negative outcomes observable. A validator outage or absent adapter is a hard CI
failure; it is never converted into a skip.

## Trust and security boundary

Chromium documents `--enable-unsafe-webgpu` as a testing/development switch and warns that
SwiftShader executes untrusted graphics work through a lower-security software path. The
[Chromium SwiftShader guidance](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md)
and
[Blink test configuration](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/web_tests/FlagSpecificConfig)
are the primary flag and risk references.

Accordingly, this validator accepts no shader path, source text, URL, stdin payload, network
response, environment override, client request, plugin, or generated code. The only accepted
sources are the small, hash-bound files in the committed manifest. The loopback page has no script
or external subresource, and the fixture text crosses into the page only through Playwright's
structured in-process evaluation channel. Arbitrary client WGSL remains prohibited by `INV-006`
and must be rejected at the future protocol boundary under `P13-015`.

The software adapter is used for deterministic compiler availability in a Linux CI runner, not as
a recommended production backend. No browser package or SwiftShader binary is committed, shipped,
or separately downloaded by this task; the implementation comes from the Playwright-coupled
Chromium installation already governed by the CI policy.

## CI placement and output

Every Node lane runs the browser-free manifest check. The existing Chromium browser lane runs the
real validator after installing its exact Playwright-coupled browser and operating-system
dependencies. Firefox and WebKit continue to execute the Wasm bundle smoke but do not become WGSL
validator authorities. This is one compiler gate, not a cross-browser WebGPU support matrix.

A successful runtime check writes ignored
`dist/validation/wgsl-fixtures.json` using `helix.wgsl-validation-report/1`. The report binds the
manifest digest, Playwright/browser/backend/adapter identities, reviewed launch flags, per-fixture
source digests and normalized compiler messages, pipeline outcomes, and totals. It is a local
diagnostic output. The Chromium lane copies it into the strict browser-report bundle and retains
that bundle for 30 days on every outcome. A task, gate, or release still promotes the exact report
and source commit under the [durable-retention policy](../quality/artifact-retention.md).

## Local commands

```bash
corepack npm run wgsl:check
corepack npm exec -- playwright install chromium
corepack npm run wgsl:validate
```

The second command may download the exact Chromium revision selected by the locked Playwright
package. The real validator currently targets the reviewed Linux x64 CI lane. A different local OS
can run the manifest check, but a successful local browser invocation does not create a platform or
native-GPU support claim.

## Change and Phase 10 handoff

A Playwright/Chromium update must re-review the SwiftShader flags and adapter identity, replay both
rejection canaries, inspect diagnostic changes, update the manifest only for intentional source
changes, and refresh CI/evidence together. Removing either negative fixture requires an equivalent
or stronger rejection canary.

Phase 10 may reuse the manifest concepts but must not silently treat this bootstrap schema as the
product kernel registry. `P10-004` defines that versioned registry; `P10-006` adds runtime shader
validation, compilation, diagnostics, caching, and invalidation; `P10-009` through `P10-014` add
CPU references and differential correctness; `P10-015` through `P10-017` add resource and fallback
behavior. Those tasks must use real device capability profiles and result evidence beyond this
compile-only foundation.
