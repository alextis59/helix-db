# Integration Tests

Reserved for cross-crate, cross-language, and multi-process behavior that cannot be proved by an in-crate unit test. The stable `npm run test:integration` command reports this suite as reserved until the first cross-language golden readers land under `P03-017`; adding an executable here without activating the suite is a command-contract failure.
