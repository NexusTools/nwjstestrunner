const path = require('path');

/** @type {import('./dist/index').NwjsHarnessConfig} */
module.exports = {
  title: '🧪 NW.js Test Runner Self-Test Suite',
  logHeaderTitle: 'NW.js Test Runner Self-Test Harness Log',
  projectRootDir: __dirname,
  testLogPath: path.join(__dirname, 'testrunner', 'test-results', 'desktop-tests.log'),
  enableWebview: true,
  webviewEntryHtml: 'runner/demo-client.html',
  screenLoadOptions: {
    requiredElementIds: ['demo-app-shell', 'demo-header', 'btn-increment', 'btn-fetch-api'],
    timeoutMs: 4000
  },
  httpRouteHandler: (req, res, { reqPath }) => {
    if (req.method === 'GET' && reqPath === '/v1/mock-status') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ status: 'online', engine: 'nwjstestrunner' }));
      return true;
    }
    return false;
  },
  testFiles: ['dist/tests/NwjsTestRunnerSuites.js'],
  liveWebviewTests: [
    {
      id: 'webview_dom_interaction_and_main_world',
      name: 'Webview DOM Counter Click & runInMainWorld State Inspection',
      timeoutMs: 4000,
      code: `
        const shell = document.getElementById('demo-app-shell');
        const display = document.getElementById('demo-counter-display');
        const incBtn = document.getElementById('btn-increment');
        if (!shell || !display || !incBtn) {
          window.__testErrors.push('Missing expected DOM elements in demo-client.html');
          return;
        }
        incBtn.click();
        incBtn.click();
        if (display.getAttribute('data-count') !== '2' || display.textContent !== 'Count: 2') {
          window.__testErrors.push('Expected counter display to update to Count: 2 after two clicks, got: ' + display.textContent);
          return;
        }
        runInMainWorld('window.demoAppState.setCount(42);');
        if (display.getAttribute('data-count') !== '42') {
          window.__testErrors.push('Expected runInMainWorld to update demoAppState count to 42');
        }
      `
    },
    {
      id: 'webview_mock_http_endpoint_fetch',
      name: 'Webview End-to-End Mock HTTP Route Fetch (/v1/mock-status)',
      timeoutMs: 4000,
      code: `
        const apiBtn = document.getElementById('btn-fetch-api');
        const apiResult = document.getElementById('demo-api-result');
        apiBtn.click();
        for (let i = 0; i < 30; i++) {
          if (apiResult.textContent && apiResult.textContent.includes('online:nwjstestrunner')) {
            break;
          }
          await new Promise(r => setTimeout(r, 50));
        }
        if (apiResult.textContent !== 'online:nwjstestrunner') {
          window.__testErrors.push('Expected #demo-api-result to show online:nwjstestrunner, got: ' + apiResult.textContent);
        }
      `
    }
  ]
};
