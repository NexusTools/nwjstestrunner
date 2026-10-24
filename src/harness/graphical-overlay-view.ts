import { GraphicalOverlayOptions } from '../types/test-runner-types';

export class GraphicalOverlayView {
  private readonly options: GraphicalOverlayOptions;
  private webviewEl: any = null;
  private titleEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private metricCurrentEl: HTMLElement | null = null;
  private metricPassedEl: HTMLElement | null = null;
  private metricFailedEl: HTMLElement | null = null;
  private progressFillEl: HTMLElement | null = null;

  constructor(options: GraphicalOverlayOptions = {}) {
    this.options = options;
  }

  public mount(doc: Document = document): void {
    const title = this.options.title || '🧪 NW.js Live Webview Test Runner';
    const enableWebview = this.options.enableWebview ?? true;
    const partition = this.options.webviewPartition || 'trusted';
    const allowNw = this.options.allowNwInWebview ?? true;

    if (!doc.getElementById('nwjstestrunner-styles')) {
      const styleEl = doc.createElement('style');
      styleEl.id = 'nwjstestrunner-styles';
      styleEl.textContent = `
        body, html {
          margin: 0;
          padding: 0;
          width: 100vw;
          height: 100vh;
          background: #11111b;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        }
        #webview-container {
          width: 100vw;
          height: 100vh;
          position: absolute;
          top: 0;
          left: 0;
          z-index: 1;
        }
        webview {
          width: 100%;
          height: 100%;
          border: none;
          opacity: 0.95;
        }
        #test-runner-overlay {
          pointer-events: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #cdd6f4;
          text-align: center;
        }
        .overlay-card {
          background: #1e1e2e;
          border: 1px solid #313244;
          padding: 30px 45px;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
          min-width: 440px;
          max-width: 560px;
        }
        .overlay-title {
          font-size: 22px;
          font-weight: bold;
          margin-bottom: 12px;
          color: #cba6f7;
        }
        .overlay-status {
          font-size: 14px;
          margin-bottom: 14px;
          color: #89b4fa;
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 460px;
        }
        .overlay-progress-track {
          width: 100%;
          height: 6px;
          background: #313244;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .overlay-progress-fill {
          width: 0%;
          height: 100%;
          background: linear-gradient(90deg, #89b4fa, #cba6f7);
          transition: width 0.12s ease-out;
        }
        .overlay-metric {
          font-size: 18px;
          margin: 8px 0;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .status-running { color: #89b4fa; }
        .status-passed { color: #a6e3a1; }
        .status-failed { color: #f38ba8; }
      `;
      doc.head.appendChild(styleEl);
    }

    if (enableWebview && !doc.getElementById('client-webview')) {
      let container = doc.getElementById('webview-container');
      if (!container) {
        container = doc.createElement('div');
        container.id = 'webview-container';
        doc.body.appendChild(container);
      }
      const wv = doc.createElement('webview');
      wv.id = 'client-webview';
      if (allowNw) {
        wv.setAttribute('allownw', '');
      }
      wv.setAttribute('partition', partition);
      container.appendChild(wv);
    }

    if (!doc.getElementById('test-runner-overlay')) {
      const overlay = doc.createElement('div');
      overlay.id = 'test-runner-overlay';
      overlay.innerHTML = `
        <div class="overlay-card">
          <div id="overlay-title" class="overlay-title"></div>
          <div id="overlay-status" class="overlay-status">Initializing test harness...</div>
          <div class="overlay-progress-track">
            <div id="overlay-progress-fill" class="overlay-progress-fill"></div>
          </div>
          <div class="overlay-metric status-running">
            <span>Completed:</span>
            <span id="metric-current">0 of 0</span>
          </div>
          <div class="overlay-metric status-passed">
            <span>✅ Tests Passed:</span>
            <span id="metric-passed">0</span>
          </div>
          <div class="overlay-metric status-failed">
            <span>❌ Tests Failed:</span>
            <span id="metric-failed">0</span>
          </div>
        </div>
      `;
      doc.body.appendChild(overlay);
    }

    this.webviewEl = doc.getElementById('client-webview');
    this.titleEl =
      doc.getElementById('overlay-title') ||
      (doc.querySelector('#test-runner-overlay .overlay-title') as HTMLElement | null);
    this.statusEl = doc.getElementById('overlay-status');
    this.metricCurrentEl = doc.getElementById('metric-current');
    this.metricPassedEl = doc.getElementById('metric-passed');
    this.metricFailedEl = doc.getElementById('metric-failed');
    this.progressFillEl = doc.getElementById('overlay-progress-fill');

    if (this.titleEl && this.options.title) {
      this.titleEl.textContent = title;
    }
    try {
      if (this.options.title && doc.title !== this.options.title) {
        doc.title = this.options.title;
      }
    } catch (_e) {}
  }

  public getWebviewElement(): any {
    return this.webviewEl;
  }

  public setTitle(title: string): void {
    if (this.titleEl) {
      this.titleEl.textContent = title;
    }
  }

  public setStatus(statusText: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = statusText;
    }
  }

  public updateMetrics(completed: number, total: number, passed: number, failed: number): void {
    if (this.metricCurrentEl) {
      this.metricCurrentEl.textContent = `${completed} of ${total}`;
    }
    if (this.metricPassedEl) {
      this.metricPassedEl.textContent = `${passed}`;
    }
    if (this.metricFailedEl) {
      this.metricFailedEl.textContent = `${failed}`;
    }
    if (this.progressFillEl) {
      const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
      this.progressFillEl.style.width = `${pct}%`;
      if (failed > 0) {
        this.progressFillEl.style.background = 'linear-gradient(90deg, #f38ba8, #eba0ac)';
      } else if (completed >= total && total > 0) {
        this.progressFillEl.style.background = 'linear-gradient(90deg, #a6e3a1, #94e2d5)';
      }
    }
  }
}
