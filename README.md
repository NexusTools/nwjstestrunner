# `@nexustools/nwjstestrunner`

Graphical NW.js Window & `<webview>` Jest-Compatible Test Runner and Harness for NW.js Node.js Applications.

`@nexustools/nwjstestrunner` allows any NW.js Node.js package to run:
1. **Jest-Compatible Unit & Integration Test Suites** (`describe`, `it`, `test`, `expect`, `.resolves`, `.rejects`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`, `jest.fn()`, `jest.spyOn()`) directly inside a real NW.js graphical environment with full Node.js + Chromium DOM access.
2. **Live `<webview>` Desktop Client DOM Integration Tests** with an isolated local HTTP server, custom mock API/SSE route handlers, console error capture, HTTP 404 tracking, `runInMainWorld` helpers, and screen readiness checks.
3. **Real-Time Graphical Progress Overlay & Deterministic Crash-Safe Logging** (`desktop-tests.log`) with startup `"Tests interupted"` watchdog protection, window-close detection, and automatic exit code (`0` or `1`).

---

## Installation

```bash
npm install --save-dev @nexustools/nwjstestrunner
```

For local live symlink development across `@nexustools` / `AICore` repositories:
```powershell
New-Item -ItemType Junction -Path "<project>\node_modules\@nexustools\nwjstestrunner" -Target "D:\GitHub\nwjstestrunner"
```

---

## Usage Modes

### 1. CLI Runner (`npx nwjstestrunner`)

Add `nwjstestrunner` to your `package.json`:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && nwjstestrunner"
  }
}
```

And configure `nwjstestrunner.config.cjs` (or `"nwjstestrunner"` in `package.json`):

```js
const path = require('path');

/** @type {import('@nexustools/nwjstestrunner').NwjsHarnessConfig} */
module.exports = {
  title: '🧪 My NW.js App Test Runner',
  logHeaderTitle: 'My NW.js App Desktop Client Test Harness Log',
  projectRootDir: __dirname,
  testLogPath: path.join(__dirname, 'testrunner', 'test-results', 'desktop-tests.log'),
  enableWebview: true,
  webviewEntryHtml: 'index.html',
  screenLoadOptions: {
    requiredElementIds: ['app-shell', 'main-canvas'],
    timeoutMs: 4000
  },
  testFiles: ['dist/src/tests/**/*.js'],
  httpRouteHandler: (req, res, { reqPath }) => {
    if (req.method === 'GET' && reqPath === '/v1/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    return false;
  },
  liveWebviewTests: [
    {
      id: 'startup_dom_check',
      name: 'Verify main application shell renders on startup',
      timeoutMs: 4000,
      code: `
        if (!document.getElementById('app-shell')) {
          window.__testErrors.push('Missing #app-shell element');
        }
      `
    }
  ]
};
```

### 2. Custom `testrunner/index.html` Harness (`nw testrunner`)

If your NW.js project launches `nw testrunner`, you can invoke `runNwjsTestHarness()` directly inside `testrunner/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NW.js Test Harness</title>
</head>
<body>
  <script>
    const { runNwjsTestHarness } = require('@nexustools/nwjstestrunner');
    runNwjsTestHarness({
      title: '🧪 My App Live Webview Test Runner',
      enableWebview: true,
      webviewEntryHtml: 'index.html',
      testFiles: ['dist/src/tests/AppSuites.js']
    });
  </script>
</body>
</html>
```

### 3. Writing Jest Test Suites (`describe`, `it`, `expect`, `jest.fn()`)

Both ESM (`import`) and CommonJS (`require`) are supported out of the box:

```ts
import {
  TestRunner,
  describe,
  it,
  expect,
  beforeEach,
  jest
} from '@nexustools/nwjstestrunner';

describe('Canvas State Suite', () => {
  let counter = 0;

  beforeEach(() => {
    counter = 10;
  });

  it('supports Jest matchers and spies', async () => {
    const onUpdate = jest.fn((v: number) => v * 2);
    expect(onUpdate(counter)).toBe(20);
    expect(onUpdate).toHaveBeenCalledWith(10);
    await expect(Promise.resolve('ready')).resolves.toBe('ready');
  });
});

// Or register suites explicitly on a TestRunner instance:
export function registerMyTestSuites(runner: TestRunner): void {
  runner.registerSuite('EngineSuite', (suite) => {
    suite.it('verifies calculations', () => {
      expect({ width: 800, height: 600 }).toMatchObject({ width: 800 });
    });
  });
}
```
