import * as http from 'http';

export interface TestFailure {
  suiteName: string;
  testName: string;
  error: Error;
}

export interface TestCaseResult {
  suiteName: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: Error;
}

export interface TestSuiteResult {
  suiteName: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  cases: TestCaseResult[];
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  failures: TestFailure[];
  suiteResults: TestSuiteResult[];
  logOutput: string;
}

export type TestCaseFn = () => Promise<void> | void;
export type LifecycleHookFn = () => Promise<void> | void;

export interface TestCase {
  name: string;
  fn: TestCaseFn;
  timeoutMs?: number;
  skip?: boolean;
  only?: boolean;
}

export interface TestSuite {
  name: string;
  cases: TestCase[];
  beforeAllHooks: LifecycleHookFn[];
  afterAllHooks: LifecycleHookFn[];
  beforeEachHooks: LifecycleHookFn[];
  afterEachHooks: LifecycleHookFn[];
  skip?: boolean;
  only?: boolean;
}

export interface TestProgressEvent {
  type: 'suite_start' | 'suite_complete' | 'test_start' | 'test_complete';
  suiteName: string;
  testName?: string;
  status?: 'passed' | 'failed' | 'skipped';
  completedCount: number;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  error?: Error;
}

export interface TestRunOptions {
  maxDurationMs?: number;
  defaultTestTimeoutMs?: number;
  filter?: string | RegExp;
  onProgress?: (event: TestProgressEvent) => void;
}

export interface ExpectMatcher {
  toBe(expected: any): void;
  toEqual(expected: any): void;
  toStrictEqual(expected: any): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeNaN(): void;
  toBeInstanceOf(expectedConstructor: any): void;
  toBeGreaterThan(expected: number | bigint): void;
  toBeGreaterThanOrEqual(expected: number | bigint): void;
  toBeLessThan(expected: number | bigint): void;
  toBeLessThanOrEqual(expected: number | bigint): void;
  toBeCloseTo(expected: number, numDigits?: number): void;
  toContain(item: any): void;
  toContainEqual(item: any): void;
  toHaveLength(expectedLength: number): void;
  toHaveProperty(keyPath: string | string[], expectedValue?: any): void;
  toMatch(expected: string | RegExp): void;
  toMatchObject(expected: Record<string, any> | any[]): void;
  toThrow(expectedError?: string | RegExp | Error | (new (...args: any[]) => Error)): void;
  toHaveBeenCalled(): void;
  toHaveBeenCalledTimes(expectedCount: number): void;
  toHaveBeenCalledWith(...expectedArgs: any[]): void;
  toHaveBeenLastCalledWith(...expectedArgs: any[]): void;
  not: ExpectMatcher;
  resolves: AsyncExpectMatcher;
  rejects: AsyncExpectMatcher;
}

export interface AsyncExpectMatcher {
  toBe(expected: any): Promise<void>;
  toEqual(expected: any): Promise<void>;
  toStrictEqual(expected: any): Promise<void>;
  toBeTruthy(): Promise<void>;
  toBeFalsy(): Promise<void>;
  toBeNull(): Promise<void>;
  toBeUndefined(): Promise<void>;
  toBeDefined(): Promise<void>;
  toContain(item: any): Promise<void>;
  toMatch(expected: string | RegExp): Promise<void>;
  toMatchObject(expected: Record<string, any> | any[]): Promise<void>;
  toThrow(expectedError?: string | RegExp | Error | (new (...args: any[]) => Error)): Promise<void>;
  not: AsyncExpectMatcher;
}

export interface MockCallRecord<TArgs extends any[] = any[], TReturn = any> {
  args: TArgs;
  type: 'return' | 'throw';
  value: TReturn;
}

export interface MockState<TArgs extends any[] = any[], TReturn = any> {
  calls: TArgs[];
  results: Array<{ type: 'return' | 'throw'; value: TReturn }>;
  instances: any[];
  lastCall?: TArgs;
}

export interface MockFunction<TArgs extends any[] = any[], TReturn = any> {
  (...args: TArgs): TReturn;
  _isMockFunction: true;
  mock: MockState<TArgs, TReturn>;
  mockImplementation(fn: (...args: TArgs) => TReturn): this;
  mockImplementationOnce(fn: (...args: TArgs) => TReturn): this;
  mockReturnValue(value: TReturn): this;
  mockReturnValueOnce(value: TReturn): this;
  mockResolvedValue(value: Awaited<TReturn>): this;
  mockResolvedValueOnce(value: Awaited<TReturn>): this;
  mockRejectedValue(err: any): this;
  mockRejectedValueOnce(err: any): this;
  mockClear(): this;
  mockReset(): this;
  mockRestore(): void;
}

export interface WebviewLiveTestSpec {
  id: string;
  name: string;
  timeoutMs?: number;
  /**
   * JavaScript code string or function to execute inside the live <webview> context.
   * Inside the webview, pushing to `window.__testErrors` or throwing an Error fails the test.
   */
  code: string | (() => Promise<void> | void);
}

export interface WebviewExecutionResult {
  ok: boolean;
  errors: string[];
  error?: string;
}

export interface WaitForScreenLoadOptions {
  /**
   * Required DOM element IDs that must exist in the webview document before tests start.
   */
  requiredElementIds?: string[];
  /**
   * Required CSS selectors that must match in the webview document before tests start.
   */
  requiredSelectors?: string[];
  /**
   * Custom JavaScript boolean expression evaluated inside the webview to check readiness.
   */
  customPredicateCode?: string;
  /**
   * Maximum time to wait for screen readiness in ms (default: 4000).
   */
  timeoutMs?: number;
  /**
   * Polling interval in ms (default: 100).
   */
  pollIntervalMs?: number;
}

export type HttpRouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context: { projectRootDir: string; reqPath: string; reqUrl: string }
) => Promise<boolean | void> | boolean | void;

export interface TestHttpServerOptions {
  projectRootDir: string;
  defaultEntryFile?: string;
  host?: string;
  port?: number;
  ignore404Paths?: string[];
  customMimeTypes?: Record<string, string>;
  onHttp404?: (reqPath: string, resolvedFilePath: string) => void;
  routeHandler?: HttpRouteHandler;
}

export interface GraphicalOverlayOptions {
  title?: string;
  subtitle?: string;
  enableWebview?: boolean;
  webviewPartition?: string;
  allowNwInWebview?: boolean;
}

export interface NwjsHarnessConfig {
  /**
   * Display title in the graphical overlay card and log file header.
   * E.g. "HAEditor Live Webview Test Runner"
   */
  title?: string;
  /**
   * Header title written into desktop-tests.log.
   * E.g. "HAEditor Desktop Client Test Harness Log"
   */
  logHeaderTitle?: string;
  /**
   * Root directory of the project being tested.
   */
  projectRootDir?: string;
  /**
   * Path to the output test log file (default: `<projectRootDir>/testrunner/test-results/desktop-tests.log`).
   */
  testLogPath?: string;
  /**
   * Prefix for temporary sandbox directory created in `os.tmpdir()`.
   */
  sandboxPrefix?: string;
  /**
   * Initialization timeout in milliseconds before aborting if harness/webview fails to start (default: 8000).
   */
  initTimeoutMs?: number;
  /**
   * Global hard deadline timeout in milliseconds for the entire test run (default: 35000).
   */
  globalTimeoutMs?: number;
  /**
   * Maximum duration in milliseconds allocated to unit test suites in `runner.runAll()` (default: 15000).
   */
  unitSuiteTimeoutMs?: number;
  /**
   * Default timeout per individual unit test case in ms (default: 2000).
   */
  defaultTestTimeoutMs?: number;
  /**
   * Optional filter string or RegExp for unit test names.
   */
  testFilter?: string | RegExp;
  /**
   * Whether to load a target client page inside the `<webview>` element (default: auto-detected from `webviewEntryHtml` or `liveWebviewTests`).
   */
  enableWebview?: boolean;
  /**
   * Entry HTML file relative to `projectRootDir` to load into the `<webview>` via local HTTP server (default: `"index.html"`).
   */
  webviewEntryHtml?: string;
  /**
   * Custom query parameters appended to the `<webview>` URL (`projectRoot` and `configDir` are included automatically unless disabled).
   */
  webviewQueryParams?: Record<string, string>;
  /**
   * Whether to pass `?projectRoot=<sandboxDir>&configDir=<configDir>` to the webview URL (default: true).
   */
  injectSandboxQueryParams?: boolean;
  /**
   * Custom HTTP route handler for mocking backend/AI endpoints during `<webview>` tests.
   */
  httpRouteHandler?: HttpRouteHandler;
  /**
   * Paths that should not trigger an HTTP 404 error when requested by the webview (default: `['/favicon.ico']`).
   */
  ignore404Paths?: string[];
  /**
   * Minimum console message level from `<webview>` to record as a test failure (`2` = error in Chromium webview; default: `2`).
   */
  webviewConsoleErrorLevel?: number;
  /**
   * Screen load readiness check options for the `<webview>`.
   */
  screenLoadOptions?: WaitForScreenLoadOptions;
  /**
   * Callback to programmatically register suites on the `TestRunner` instance.
   */
  registerSuites?: (runner: any, context: { projectRootDir: string; sandboxDir: string; configDir: string }) => Promise<void> | void;
  /**
   * Paths or glob-like file paths (relative to `projectRootDir` or absolute) of test modules to `require()` before running.
   * Modules can either use global/imported `describe`/`it`/`expect` or export a `registerTestSuites(runner)` / `registerSuites(runner)` function.
   */
  testFiles?: string[];
  /**
   * Live DOM integration tests to execute sequentially inside the `<webview>`.
   */
  liveWebviewTests?: WebviewLiveTestSpec[];
  /**
   * Whether to automatically call `process.exit(exitCode)` when tests complete (default: true).
   */
  autoExit?: boolean;
  /**
   * Keep the graphical NW.js window open after test completion for visual inspection (default: false).
   */
  keepOpen?: boolean;
}

export interface NwjsCliOptions {
  projectRootDir?: string;
  configPath?: string;
  testFiles?: string[];
  testFilter?: string;
  logPath?: string;
  title?: string;
  webviewEntryHtml?: string;
  enableWebview?: boolean;
  initTimeoutMs?: number;
  globalTimeoutMs?: number;
  userDataDir?: string;
  nwExecutablePath?: string;
  keepOpen?: boolean;
  headlessArgs?: string[];
}
