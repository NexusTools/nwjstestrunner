import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HarnessConfigLoader } from '../config/harness-config-loader';
import { installJestGlobals, TestRunner } from '../core/test-runner';
import { NwjsHarnessConfig, TestProgressEvent } from '../types/test-runner-types';
import { GraphicalOverlayView } from './graphical-overlay-view';
import { TestHttpServer } from './test-http-server';
import { TestLogWriter } from './test-log-writer';
import { WebviewTestController } from './webview-test-controller';

export class NwjsGraphicalTestHarness {
  private readonly config: NwjsHarnessConfig;
  private readonly projectRootDir: string;
  private readonly testSandboxDir: string;
  private readonly testConfigDir: string;
  private readonly logWriter: TestLogWriter;
  private readonly overlayView: GraphicalOverlayView;
  private httpServer: TestHttpServer | null = null;
  private webviewController: WebviewTestController | null = null;
  private initTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private globalTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private hasStartedExecution = false;
  private hasFinished = false;

  constructor(config: NwjsHarnessConfig = {}) {
    this.config = config;
    this.projectRootDir = HarnessConfigLoader.resolveProjectRoot(config.projectRootDir);

    const sandboxPrefix = config.sandboxPrefix || 'nwjs-webview-test-';
    this.testSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), sandboxPrefix));
    this.testConfigDir = path.join(this.testSandboxDir, 'os-config');
    fs.mkdirSync(this.testConfigDir, { recursive: true });

    const defaultLogPath = path.join(
      this.projectRootDir,
      'testrunner',
      'test-results',
      'desktop-tests.log'
    );
    const winAny = typeof window !== 'undefined' ? (window as any) : undefined;
    const resolvedLogPath =
      config.testLogPath ||
      (winAny && winAny.__testLogPath) ||
      process.env.NWJS_TEST_LOG_PATH ||
      defaultLogPath;

    const rawTitle = config.title || 'NW.js Desktop Client Test Harness Log';
    const headerTitle =
      config.logHeaderTitle ||
      (rawTitle.toLowerCase().endsWith('log') ? rawTitle : `${rawTitle} Log`);

    this.logWriter = new TestLogWriter(resolvedLogPath, headerTitle);
    this.overlayView = new GraphicalOverlayView({
      title: config.overlayTitle || config.title || '🧪 NW.js Live Webview Test Runner',
      enableWebview: this.shouldEnableWebview()
    });
  }

  private getLiveWebviewTests() {
    return this.config.liveWebviewTests || this.config.webviewTests || [];
  }

  private getScreenLoadOptions() {
    if (this.config.screenLoadOptions) {
      return this.config.screenLoadOptions;
    }
    if (this.config.waitForReadyScript) {
      return { customPredicateCode: this.config.waitForReadyScript };
    }
    return undefined;
  }

  private shouldEnableWebview(): boolean {
    if (typeof this.config.enableWebview === 'boolean') {
      return this.config.enableWebview;
    }
    if (this.getLiveWebviewTests().length > 0) {
      return true;
    }
    if (this.config.webviewEntryHtml || this.config.webviewUrl) {
      return true;
    }
    return false;
  }

  public getLogWriter(): TestLogWriter {
    return this.logWriter;
  }

  public getProjectRootDir(): string {
    return this.projectRootDir;
  }

  public getSandboxDir(): string {
    return this.testSandboxDir;
  }

  public getConfigDir(): string {
    return this.testConfigDir;
  }

  public async start(): Promise<{ exitCode: number; logText: string }> {
    this.logWriter.writeProgressSnapshot('Tests interupted (Initializing test harness...)');

    if (typeof document !== 'undefined') {
      this.overlayView.mount(document);
    }

    this.setupWindowAndProcessLifecycle();

    const initTimeoutMs = this.config.initTimeoutMs ?? 8000;
    const globalTimeoutMs = this.config.globalTimeoutMs ?? 35000;

    this.initTimeoutTimer = setTimeout(() => {
      if (!this.hasStartedExecution && !this.hasFinished) {
        this.logWriter.recordError(
          'InitializationTimeout',
          `Tests interupted: Test runner failed to initialize within ${initTimeoutMs}ms.`
        );
        this.finishAndExit();
      }
    }, initTimeoutMs);

    this.globalTimeoutTimer = setTimeout(() => {
      if (!this.hasFinished) {
        this.logWriter.recordError(
          'GlobalHarnessTimeout',
          `Test runner harness timed out after ${globalTimeoutMs}ms.`
        );
        this.finishAndExit();
      }
    }, globalTimeoutMs);

    try {
      if (this.config.beforeStart) {
        await this.config.beforeStart({
          projectRootDir: this.projectRootDir,
          sandboxDir: this.testSandboxDir,
          configDir: this.testConfigDir
        });
      }

      await this.prepareTestSuites();

      if (this.shouldEnableWebview() && typeof document !== 'undefined') {
        const webviewEl = this.overlayView.getWebviewElement();
        if (!webviewEl) {
          this.logWriter.recordError(
            'WebviewElementMissing',
            'Expected #client-webview element in DOM when enableWebview is true'
          );
          return await this.finishAndExit();
        }

        this.webviewController = new WebviewTestController(webviewEl, {
          consoleErrorLevel: this.config.webviewConsoleErrorLevel ?? 2,
          onError: (source, err) => this.logWriter.recordError(source, err),
          onLoadAbort: () => {
            this.finishAndExit();
          }
        });

        return await new Promise<{ exitCode: number; logText: string }>((resolve) => {
          this.webviewController!.attachEventListeners(() => {
            if (this.hasStartedExecution) return;
            this.markExecutionStarted();
            this.executeAllTests()
              .then((res) => resolve(res))
              .catch((err) => {
                this.logWriter.recordError('TestRunnerExecution', err);
                this.finishAndExit().then(resolve);
              });
          });

          this.startHttpServerAndNavigateWebview().catch((err) => {
            this.logWriter.recordError('HttpServerStartError', err);
            this.finishAndExit().then(resolve);
          });
        });
      } else {
        this.markExecutionStarted();
        return await this.executeAllTests();
      }
    } catch (err) {
      this.logWriter.recordError('TopLevelHarnessError', err);
      return await this.finishAndExit();
    }
  }

  private markExecutionStarted(): void {
    this.hasStartedExecution = true;
    if (this.initTimeoutTimer) {
      clearTimeout(this.initTimeoutTimer);
      this.initTimeoutTimer = null;
    }
    if (typeof window !== 'undefined') {
      const winAny = window as any;
      winAny.__harnessInitialized = true;
      if (winAny.__initWatchdogTimer) {
        clearTimeout(winAny.__initWatchdogTimer);
      }
    }
  }

  private setupWindowAndProcessLifecycle(): void {
    try {
      const nwGlobal = typeof (globalThis as any).nw !== 'undefined' ? (globalThis as any).nw : undefined;
      if (nwGlobal && nwGlobal.Window && typeof nwGlobal.Window.get === 'function') {
        const win = nwGlobal.Window.get();
        win.on('close', () => {
          if (!this.hasFinished) {
            const m = this.logWriter.getMetrics();
            this.logWriter.writeProgressSnapshot(
              `Tests interupted (Closed by user at ${m.passedCount + m.failedCount} of ${m.totalTests})`
            );
          }
          try {
            win.close(true);
          } catch (_e) {}
          process.exit(1);
        });
      }
    } catch (_e) {}

    if (typeof window !== 'undefined') {
      window.onerror = (message, _source, _lineno, _colno, error) => {
        this.logWriter.recordError('HostWindowOnError', error || message);
        this.finishAndExit();
      };

      window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        this.logWriter.recordError('HostUnhandledRejection', e.reason);
        this.finishAndExit();
      });
    }
  }

  private async startHttpServerAndNavigateWebview(): Promise<void> {
    if (this.config.webviewUrl) {
      this.webviewController?.navigate(this.config.webviewUrl);
      return;
    }

    const entryHtml = this.config.webviewEntryHtml || 'index.html';
    this.httpServer = new TestHttpServer({
      projectRootDir: this.projectRootDir,
      defaultEntryFile: entryHtml,
      ignore404Paths: this.config.ignore404Paths,
      routeHandler: this.config.httpRouteHandler,
      onHttp404: (reqPath, resolvedFilePath) => {
        this.logWriter.recordError(
          'Http404Error',
          `HTTP 404 Not Found: ${reqPath} (resolved: ${resolvedFilePath})`
        );
      }
    });

    const port = await this.httpServer.start();
    const queryParams = new URLSearchParams();
    if (this.config.injectSandboxQueryParams !== false) {
      queryParams.set('projectRoot', this.testSandboxDir);
      queryParams.set('configDir', this.testConfigDir);
    }
    if (this.config.webviewQueryParams) {
      for (const [k, v] of Object.entries(this.config.webviewQueryParams)) {
        queryParams.set(k, v);
      }
    }

    const cleanEntry = entryHtml.startsWith('/') ? entryHtml.slice(1) : entryHtml;
    const qs = queryParams.toString();
    const targetUrl = `http://127.0.0.1:${port}/${cleanEntry}${qs ? `?${qs}` : ''}`;
    this.webviewController?.navigate(targetUrl);
  }

  private async prepareTestSuites(): Promise<void> {
    installJestGlobals(globalThis);
    if (typeof window !== 'undefined') {
      installJestGlobals(window);
    }

    const runner = TestRunner.getInstance();
    runner.reset();

    const context = {
      projectRootDir: this.projectRootDir,
      sandboxDir: this.testSandboxDir,
      configDir: this.testConfigDir
    };

    if (this.config.registerSuites) {
      await this.config.registerSuites(runner, context);
    }

    const shouldLoadFiles =
      (this.config.testFiles && this.config.testFiles.length > 0) || !this.config.registerSuites;

    if (shouldLoadFiles) {
      const files = HarnessConfigLoader.resolveTestFiles(
        this.projectRootDir,
        this.config.testFiles
      );
      const { pathToFileURL } = require('url');
      const nativeDynamicImport = new Function('u', 'return import(u)');

      for (const filePath of files) {
        let mod: any;
        try {
          try {
            delete require.cache[require.resolve(filePath)];
          } catch (_e) {}
          mod = require(filePath);
        } catch (_reqErr) {
          const fileUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
          mod = await nativeDynamicImport(fileUrl);
        }
        if (typeof mod === 'function') {
          await mod(runner, context);
        } else if (mod && typeof mod === 'object') {
          for (const [exportName, exportVal] of Object.entries(mod)) {
            if (
              typeof exportVal === 'function' &&
              (exportName === 'registerSuites' ||
                exportName === 'registerTestSuites' ||
                /^register.*(?:Suites|Tests)$/i.test(exportName))
            ) {
              await (exportVal as any)(runner, context);
            }
          }
        }
      }
    }
  }

  private async executeAllTests(): Promise<{ exitCode: number; logText: string }> {
    try {
      const runner = TestRunner.getInstance();
      const liveTests = this.getLiveWebviewTests();
      const unitCount = runner.totalCasesCount;
      const totalTests = unitCount + liveTests.length;

      this.logWriter.setTotalTests(totalTests);
      this.overlayView.updateMetrics(0, totalTests, 0, 0);
      this.overlayView.setStatus(`Running ${totalTests} tests...`);
      this.logWriter.writeProgressSnapshot(
        `Tests interupted (Running unit suites: 0 of ${totalTests})`
      );

      if (this.webviewController && this.shouldEnableWebview()) {
        const screenLoaded = await this.webviewController.waitForScreenLoad(
          this.getScreenLoadOptions()
        );
        if (!screenLoaded) {
          this.logWriter.recordError(
            'WebviewScreenTimeout',
            'Client screen inside webview failed readiness check within timeout.'
          );
        }
      }

      if (unitCount > 0) {
        const jestSummary = await runner.runAll({
          maxDurationMs: this.config.unitSuiteTimeoutMs ?? 30000,
          defaultTestTimeoutMs: this.config.defaultTestTimeoutMs ?? 12000,
          filter: this.config.testFilter,
          onProgress: (ev: TestProgressEvent) => {
            if (ev.type === 'test_start') {
              this.overlayView.setStatus(`Running: ${ev.suiteName} > ${ev.testName}`);
            } else if (ev.type === 'test_complete') {
              this.logWriter.setCounts(ev.passedCount, ev.failedCount);
              this.overlayView.updateMetrics(
                ev.completedCount,
                totalTests,
                ev.passedCount,
                ev.failedCount
              );
              this.logWriter.writeProgressSnapshot(
                `Tests interupted (Running unit suites: ${ev.completedCount} of ${totalTests})`
              );
            }
          }
        });

        this.logWriter.setCounts(jestSummary.passed, jestSummary.failed);
        this.overlayView.updateMetrics(
          jestSummary.passed + jestSummary.failed,
          totalTests,
          jestSummary.passed,
          jestSummary.failed
        );
        this.logWriter.writeProgressSnapshot(
          `Tests interupted (Completed unit suites: ${jestSummary.passed + jestSummary.failed} of ${totalTests})`
        );

        if (jestSummary.failures && jestSummary.failures.length > 0) {
          for (const f of jestSummary.failures) {
            this.logWriter.recordError(
              `JestSuite[${f.suiteName}]`,
              `${f.testName} -> ${f.error?.message || f.error}`
            );
          }
        }
      }

      if (this.webviewController && liveTests.length > 0) {
        const totalLive = liveTests.length;
        for (let i = 0; i < totalLive; i++) {
          const spec = liveTests[i];
          const completedSoFar = unitCount + i + 1;
          this.overlayView.setStatus(`Running [${i + 1}/${totalLive}]: ${spec.name}`);
          this.logWriter.writeProgressSnapshot(
            `Tests interupted (Running live test [${i + 1}/${totalLive}]: ${spec.id})`
          );

          const res = await this.webviewController.executeWebviewTest(
            spec.code,
            spec.timeoutMs ?? 4000
          );
          if (res.ok) {
            this.logWriter.incrementPassed(1);
          } else {
            this.logWriter.incrementFailed(1);
            const errs =
              res.errors && res.errors.length > 0
                ? res.errors
                : [res.error || 'Unknown webview test error'];
            for (const err of errs) {
              this.logWriter.recordError(spec.id, err);
            }
          }

          const m = this.logWriter.getMetrics();
          this.overlayView.updateMetrics(completedSoFar, totalTests, m.passedCount, m.failedCount);
        }
      }

      const finalMetrics = this.logWriter.getMetrics();
      this.overlayView.setStatus('All tests completed!');
      this.overlayView.updateMetrics(
        totalTests,
        totalTests,
        finalMetrics.passedCount,
        finalMetrics.failedCount
      );
    } catch (err) {
      this.logWriter.recordError('TestRunnerExecution', err);
    }

    return await this.finishAndExit();
  }

  public async finishAndExit(): Promise<{ exitCode: number; logText: string }> {
    if (this.hasFinished) {
      return this.logWriter.writeFinalSummary();
    }
    this.hasFinished = true;

    if (typeof window !== 'undefined') {
      (window as any).__harnessCompleted = true;
      if ((window as any).__initWatchdogTimer) {
        clearTimeout((window as any).__initWatchdogTimer);
      }
    }

    if (this.initTimeoutTimer) {
      clearTimeout(this.initTimeoutTimer);
      this.initTimeoutTimer = null;
    }
    if (this.globalTimeoutTimer) {
      clearTimeout(this.globalTimeoutTimer);
      this.globalTimeoutTimer = null;
    }

    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = null;
    }

    try {
      if (this.testSandboxDir && fs.existsSync(this.testSandboxDir)) {
        fs.rmSync(this.testSandboxDir, { recursive: true, force: true });
      }
    } catch (_e) {}

    const result = this.logWriter.writeFinalSummary();
    console.log(`Test runner finished with exit code ${result.exitCode}`);

    const autoExit = this.config.autoExit ?? true;
    const keepOpen = this.config.keepOpen ?? false;
    if (autoExit && !keepOpen) {
      process.exit(result.exitCode);
    }

    return result;
  }
}

export async function runNwjsTestHarness(
  config?: NwjsHarnessConfig
): Promise<{ exitCode: number; logText: string }> {
  const effectiveConfig = config || HarnessConfigLoader.loadConfig();
  const harness = new NwjsGraphicalTestHarness(effectiveConfig);
  return harness.start();
}
