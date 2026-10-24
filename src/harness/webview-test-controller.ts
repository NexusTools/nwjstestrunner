import {
  WaitForScreenLoadOptions,
  WebviewExecutionResult
} from '../types/test-runner-types';

export class WebviewTestController {
  private readonly webview: any;
  private readonly onError?: (source: string, err: any) => void;
  private readonly onLoadAbort?: (reason: string) => void;
  private readonly consoleErrorLevel: number;

  constructor(
    webview: any,
    options?: {
      consoleErrorLevel?: number;
      onError?: (source: string, err: any) => void;
      onLoadAbort?: (reason: string) => void;
    }
  ) {
    this.webview = webview;
    this.consoleErrorLevel = options?.consoleErrorLevel ?? 2;
    this.onError = options?.onError;
    this.onLoadAbort = options?.onLoadAbort;
  }

  public attachEventListeners(onContentLoad: () => void): void {
    if (!this.webview || typeof this.webview.addEventListener !== 'function') {
      return;
    }

    this.webview.addEventListener('console-message', (e: any) => {
      if (e && typeof e.level === 'number' && e.level >= this.consoleErrorLevel) {
        this.onError?.(`WebviewConsole[L${e.level}]`, e.message);
      }
    });

    this.webview.addEventListener('loadabort', (e: any) => {
      const reason = e?.reason || 'Unknown reason';
      this.onError?.('WebviewLoadAbort', `Failed to load client in webview: ${reason}`);
      this.onLoadAbort?.(reason);
    });

    this.webview.addEventListener('contentload', () => {
      onContentLoad();
    });
  }

  public navigate(url: string): void {
    if (this.webview) {
      this.webview.src = url;
    }
  }

  public execScriptWithTimeout(code: string, timeoutMs = 1500): Promise<any> {
    return new Promise((resolve) => {
      if (!this.webview || typeof this.webview.executeScript !== 'function') {
        resolve(null);
        return;
      }

      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, timeoutMs);

      try {
        this.webview.executeScript({ code }, (results: any[]) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(results && results[0] !== undefined ? results[0] : null);
          }
        });
      } catch (_e) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    });
  }

  public async waitForScreenLoad(options: WaitForScreenLoadOptions = {}): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 4000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const requiredIds = options.requiredElementIds ?? [];
    const requiredSelectors = options.requiredSelectors ?? [];
    const customPredicate = options.customPredicateCode;

    const cleanedPredicate = customPredicate ? customPredicate.trim().replace(/;+$/, '') : '';

    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));
    const checkScript = `
      (function() {
        if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
          return false;
        }
        const reqIds = ${JSON.stringify(requiredIds)};
        for (let i = 0; i < reqIds.length; i++) {
          if (!document.getElementById(reqIds[i])) return false;
        }
        const reqSels = ${JSON.stringify(requiredSelectors)};
        for (let i = 0; i < reqSels.length; i++) {
          if (!document.querySelector(reqSels[i])) return false;
        }
        ${cleanedPredicate ? `return Boolean(${cleanedPredicate});` : 'return true;'}
      })();
    `;

    for (let i = 0; i < maxAttempts; i++) {
      const res = await this.execScriptWithTimeout(checkScript, Math.min(500, timeoutMs));
      if (res === true || res === 'true') {
        return true;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    return false;
  }

  public async executeWebviewTest(
    codeOrFn: string | (() => Promise<void> | void),
    timeoutMs = 4000
  ): Promise<WebviewExecutionResult> {
    const bodyExpr =
      typeof codeOrFn === 'function' ? `await (${codeOrFn.toString()})();` : codeOrFn;

    return new Promise<WebviewExecutionResult>((resolve) => {
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve({
            ok: false,
            errors: [`Test timed out after ${timeoutMs}ms`],
            error: `Test timed out after ${timeoutMs}ms`
          });
        }
      }, timeoutMs);

      const wrappedCode = `
        (function() {
          window.__testDone = false;
          window.__testErrors = [];
          function runInMainWorld(jsBody) {
            const s = document.createElement('script');
            s.textContent = '(function(){ ' + jsBody + ' })();';
            document.body.appendChild(s);
            s.remove();
          }
          (async function() {
            try {
              ${bodyExpr}
            } catch (e) {
              window.__testErrors.push(e && (e.stack || e.message) ? (e.stack || e.message) : String(e));
            } finally {
              window.__testDone = true;
            }
          })();
          return 'started';
        })();
      `;

      this.execScriptWithTimeout(wrappedCode, 1000).then(() => {
        const pollInterval = setInterval(async () => {
          if (finished) {
            clearInterval(pollInterval);
            return;
          }
          const rawData = await this.execScriptWithTimeout(
            `(function() { return JSON.stringify({ done: !!window.__testDone, errors: window.__testErrors || [] }); })();`,
            500
          );
          try {
            const data = rawData ? JSON.parse(rawData) : null;
            if (data && data.done) {
              finished = true;
              clearTimeout(timer);
              clearInterval(pollInterval);
              resolve({
                ok: Array.isArray(data.errors) && data.errors.length === 0,
                errors: Array.isArray(data.errors) ? data.errors : []
              });
            }
          } catch (_e) {}
        }, 75);
      });
    });
  }
}
