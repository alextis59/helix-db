# JavaScript and TypeScript Packages

This root is the private npm workspace boundary selected by the [JavaScript/TypeScript toolchain policy](../docs/architecture/javascript-toolchain-policy.md).

- `sdk-typescript/` is reserved for the core TypeScript SDK.
- `browser-host/` is reserved for the browser host and bundle entry points.

The child directories intentionally have no `package.json` yet. They are not installable or publishable packages, and public coordinates remain blocked by `P16-016`.
