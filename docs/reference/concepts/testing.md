---
title: Testing
description: Pest (PHP), Vitest (frontend), SonarQube coverage gate.
---

# Testing in Spora

## Backend (Pest)

```bash
composer test              # Run all tests
composer test:coverage     # With coverage
./vendor/bin/pest --filter="pattern"  # Filter tests
```

### Structure

```text
tests/
├── Pest.php            # Pest bootstrap + shared helpers
├── Unit/               # Unit tests (mirrors app/ subpackages)
├── Feature/            # HTTP/controller integration tests
└── Fixtures/           # Test fixtures (plugins, sample data)
```

## Frontend (Vitest)

The frontend lives in the separate [`spora-frontend`](https://github.com/spora-ai/spora-frontend) repository — `spora-core` dropped its own `frontend/` tree. Clone it and run its tests there:

```bash
git clone https://github.com/spora-ai/spora-frontend.git
cd /path/to/spora-frontend
npm test              # Run all
npm run test:watch    # Watch mode
```

### Structure

```text
tests/
├── api/                # HTTP client tests
├── apps/               # App-shell tests
├── components/         # Vue component tests
│   ├── agent/
│   └── layout/
├── composables/        # useFoo() composable tests
├── pages/              # Page-level tests
├── stores/             # Pinia store tests
├── utils/              # Pure utility tests
├── a11y/               # Accessibility tests
├── fixtures/           # Test data
├── helpers/            # Shared test helpers
├── integration/        # Multi-module integration tests
├── lib/                # Plain library tests
├── router/             # Router tests
├── scripts/            # Build-script tests
├── vite/               # Vite plugin tests
├── workers/            # Web-worker tests
└── setup.ts            # Vitest global setup (mocks browser APIs)
```

## Static Analysis

```bash
composer analyse   # PHPStan (level 5, with Larastan + Mockery extensions)
cd /path/to/spora-frontend && npm run lint   # ESLint (flat config); vue-tsc runs in npm run build
```

## CI

The two repositories gate independently. In `spora-core`: `composer analyse`, the Pest suite and a php-cs-fixer dry run. In `spora-frontend`: `npm run lint`, `npm test` and `npm run build`.

## Coverage Policy (SonarQube)

- **Per-PR new-code coverage gate: `new_coverage >= 80%`.** This is the SonarQube quality gate — the "new code" window is the diff of the PR, not the whole repo. Legacy untouched files are excluded from the gate.
- **Whole-repo coverage** is reported as a secondary signal but is not part of the gate.
- For the frontend, lcov is uploaded to SonarQube from the coverage output of `spora-frontend`'s own CI run (already wired in its `sonar-project.properties`).
- Whole-repo coverage rose from roughly 44% to 67% over a series of frontend test-hardening phases, by (a) extracting sub-components from the largest SFCs (`TaskChatPage.vue`, `AgentSettingsPage.vue`, `SharedScheduleEditor.vue`) and (b) adding page/admin/memory SFC tests. See the [Frontend architecture](/reference/concepts/frontend-architecture) page for the per-phase breakdown.

## Component test patterns

The frontend tests follow these conventions (see `spora-frontend/tests/components/agent/AgentToolConfigModal.spec.ts` for reference):

- **Modal stubs** — wrap the real `Modal.vue` with a stub that uses `v-if="modelValue"` and renders named slots (`<slot name="footer" />`) so action buttons are still findable by the test.
- **Sub-component stubs** — register via `global: { stubs: { Foo: { template: '...' } } }` and use a stable class (e.g. `class="foo-stub"`) so the assertion targets the stub, not the real component.
- **Composable mocks** — for components that own their own state via `useFoo()`, pass the state as props and the actions as `@event` emits. The composable lives in the parent (page) so the child stays purely presentational and testable in isolation.
- **Store mocks** — Pinia auto-unwraps refs accessed via store properties, so mocks must expose `get foo() { return fooRef.value }` rather than the ref itself, otherwise `taskStore.activeTask` returns the ref instead of the value.
