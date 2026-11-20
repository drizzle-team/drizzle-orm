# AGENTS.md — packages/client/type-tests

## Role

Compile-time contract tests for the public Pulse client API.

These tests define the expected user-facing TypeScript contract for:
- `createPulseClient`
- `usePulseQuery`
- `QueryDescriptor`
- Pulse query result shapes and argument signatures

## Stability Rules

- ❌ Never alter these tests without explicit user permission.
- ❌ Never weaken, delete, or narrow assertions just to make a refactor pass.
- ❌ Never replace concrete expected user-facing shapes with looser/internal helper-type assertions unless the user explicitly requests that contract change.
- ❌ Never replace concrete expected user-facing shapes with inferred/self-referential forms (e.g. `typeof x._.result`, `ReturnType<...>['_']['result']`) unless the user explicitly requests that contract change.
- ✅ Treat these files as the stable client contract for the SDK.
- ✅ If production code changes require these tests to change, stop and get explicit confirmation that the client contract itself is intended to change.

## Expectations

- Prefer concrete expected values/shapes over intermediate mapped helper types when asserting public API results.
- Keep tests compile-time only.
- Keep coverage focused on public API behavior, not implementation details.
