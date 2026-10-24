# `@nexustools/nwjstestrunner` — Agent Architecture & Guidelines

## Overview
`@nexustools/nwjstestrunner` (`D:\GitHub\nwjstestrunner`) is the shared graphical NW.js & `<webview>` Jest test runner package for NW.js Node.js applications across the `AICore` and `NexusTools` ecosystem.

## Modular 1-Class-Per-File Layout
Every `.ts` file in `src/` exports **at most 1 class**:
- [`src/types/test-runner-types.ts`](file:///D:/GitHub/nwjstestrunner/src/types/test-runner-types.ts) — Type definitions and configuration interfaces (0 classes)
- [`src/matchers/deep-equality-helper.ts`](file:///D:/GitHub/nwjstestrunner/src/matchers/deep-equality-helper.ts) — `DeepEqualityHelper` (1 class)
- [`src/matchers/expect-matcher.ts`](file:///D:/GitHub/nwjstestrunner/src/matchers/expect-matcher.ts) — `ExpectMatcherBuilder` + `expect()` (1 class)
- [`src/mock/jest-mock-factory.ts`](file:///D:/GitHub/nwjstestrunner/src/mock/jest-mock-factory.ts) — `JestMockFactory` + `jest` (1 class)
- [`src/core/test-runner.ts`](file:///D:/GitHub/nwjstestrunner/src/core/test-runner.ts) — `TestRunner` + `describe`, `it`, `test`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `installJestGlobals` (1 class)
- [`src/harness/test-log-writer.ts`](file:///D:/GitHub/nwjstestrunner/src/harness/test-log-writer.ts) — `TestLogWriter` (1 class)
- [`src/harness/test-http-server.ts`](file:///D:/GitHub/nwjstestrunner/src/harness/test-http-server.ts) — `TestHttpServer` (1 class)
- [`src/harness/graphical-overlay-view.ts`](file:///D:/GitHub/nwjstestrunner/src/harness/graphical-overlay-view.ts) — `GraphicalOverlayView` (1 class)
- [`src/harness/webview-test-controller.ts`](file:///D:/GitHub/nwjstestrunner/src/harness/webview-test-controller.ts) — `WebviewTestController` (1 class)
- [`src/harness/nwjs-graphical-test-harness.ts`](file:///D:/GitHub/nwjstestrunner/src/harness/nwjs-graphical-test-harness.ts) — `NwjsGraphicalTestHarness` + `runNwjsTestHarness()` (1 class)
- [`src/config/harness-config-loader.ts`](file:///D:/GitHub/nwjstestrunner/src/config/harness-config-loader.ts) — `HarnessConfigLoader` (1 class)
- [`src/cli/nwjs-cli-launcher.ts`](file:///D:/GitHub/nwjstestrunner/src/cli/nwjs-cli-launcher.ts) — `NwjsCliLauncher` (1 class)
- [`src/index.ts`](file:///D:/GitHub/nwjstestrunner/src/index.ts) — Barrel export (0 classes)
- [`src/tests/NwjsTestRunnerSuites.ts`](file:///D:/GitHub/nwjstestrunner/src/tests/NwjsTestRunnerSuites.ts) — Self-test suites (0 classes)
