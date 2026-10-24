import { expect } from '../matchers/expect-matcher';
import { jest } from '../mock/jest-mock-factory';
import {
  LifecycleHookFn,
  TestCase,
  TestCaseFn,
  TestCaseResult,
  TestFailure,
  TestProgressEvent,
  TestRunOptions,
  TestSuite,
  TestSuiteResult,
  TestSummary
} from '../types/test-runner-types';

export interface SuiteBuilderScope {
  it: (testName: string, fn: TestCaseFn, timeoutMs?: number) => void;
  test: (testName: string, fn: TestCaseFn, timeoutMs?: number) => void;
  beforeAll: (fn: LifecycleHookFn) => void;
  afterAll: (fn: LifecycleHookFn) => void;
  beforeEach: (fn: LifecycleHookFn) => void;
  afterEach: (fn: LifecycleHookFn) => void;
}

export class TestRunner {
  private static instance: TestRunner | null = null;
  private suites: TestSuite[] = [];
  private suiteStack: string[] = [];
  private currentSuiteName = 'DefaultSuite';

  public get suiteCount(): number {
    return this.suites.length;
  }

  public get totalCasesCount(): number {
    return this.suites.reduce((sum, s) => sum + s.cases.length, 0);
  }

  public getSuites(): ReadonlyArray<TestSuite> {
    return this.suites;
  }

  public static getInstance(): TestRunner {
    if (!TestRunner.instance) {
      TestRunner.instance = new TestRunner();
    }
    return TestRunner.instance;
  }

  public reset(): void {
    this.suites = [];
    this.suiteStack = [];
    this.currentSuiteName = 'DefaultSuite';
  }

  private getOrCreateSuite(name: string, options?: { skip?: boolean; only?: boolean }): TestSuite {
    let suite = this.suites.find((s) => s.name === name);
    if (!suite) {
      suite = {
        name,
        cases: [],
        beforeAllHooks: [],
        afterAllHooks: [],
        beforeEachHooks: [],
        afterEachHooks: [],
        skip: options?.skip,
        only: options?.only
      };
      this.suites.push(suite);
    } else {
      if (options?.skip) suite.skip = true;
      if (options?.only) suite.only = true;
    }
    return suite;
  }

  public registerSuite(
    name: string,
    defineFn: (suite: SuiteBuilderScope) => void,
    options?: { skip?: boolean; only?: boolean }
  ): void {
    const fullName =
      this.suiteStack.length > 0 ? `${this.suiteStack.join(' > ')} > ${name}` : name;
    const previousSuiteName = this.currentSuiteName;
    this.suiteStack.push(name);
    this.currentSuiteName = fullName;

    const currentSuite = this.getOrCreateSuite(fullName, options);

    const testScope: SuiteBuilderScope = {
      it: (testName: string, fn: TestCaseFn, timeoutMs?: number) => {
        currentSuite.cases.push({ name: testName, fn, timeoutMs });
      },
      test: (testName: string, fn: TestCaseFn, timeoutMs?: number) => {
        currentSuite.cases.push({ name: testName, fn, timeoutMs });
      },
      beforeAll: (fn: LifecycleHookFn) => {
        currentSuite.beforeAllHooks.push(fn);
      },
      afterAll: (fn: LifecycleHookFn) => {
        currentSuite.afterAllHooks.push(fn);
      },
      beforeEach: (fn: LifecycleHookFn) => {
        currentSuite.beforeEachHooks.push(fn);
      },
      afterEach: (fn: LifecycleHookFn) => {
        currentSuite.afterEachHooks.push(fn);
      }
    };

    try {
      defineFn(testScope);
    } finally {
      this.suiteStack.pop();
      this.currentSuiteName =
        this.suiteStack.length > 0 ? this.suiteStack.join(' > ') : previousSuiteName;
    }
  }

  public addCase(
    suiteName: string,
    testName: string,
    fn: TestCaseFn,
    options?: { timeoutMs?: number; skip?: boolean; only?: boolean }
  ): void {
    const suite = this.getOrCreateSuite(suiteName);
    suite.cases.push({
      name: testName,
      fn,
      timeoutMs: options?.timeoutMs,
      skip: options?.skip,
      only: options?.only
    });
  }

  public addBeforeAll(fn: LifecycleHookFn, suiteName = this.currentSuiteName): void {
    this.getOrCreateSuite(suiteName).beforeAllHooks.push(fn);
  }

  public addAfterAll(fn: LifecycleHookFn, suiteName = this.currentSuiteName): void {
    this.getOrCreateSuite(suiteName).afterAllHooks.push(fn);
  }

  public addBeforeEach(fn: LifecycleHookFn, suiteName = this.currentSuiteName): void {
    this.getOrCreateSuite(suiteName).beforeEachHooks.push(fn);
  }

  public addAfterEach(fn: LifecycleHookFn, suiteName = this.currentSuiteName): void {
    this.getOrCreateSuite(suiteName).afterEachHooks.push(fn);
  }

  public getCurrentSuiteName(): string {
    return this.currentSuiteName;
  }

  private async executeWithTimeout(fn: () => Promise<void> | void, timeoutMs: number, label: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const runPromise = Promise.resolve().then(() => fn());
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });
      await Promise.race([runPromise, timeoutPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  public async runAll(optionsOrMaxDurationMs: number | TestRunOptions = 5000): Promise<TestSummary> {
    const options: TestRunOptions =
      typeof optionsOrMaxDurationMs === 'number'
        ? { maxDurationMs: optionsOrMaxDurationMs }
        : optionsOrMaxDurationMs;

    const maxDurationMs = options.maxDurationMs ?? 15000;
    const defaultTestTimeoutMs = options.defaultTestTimeoutMs ?? 2000;
    const filter = options.filter;
    const onProgress = options.onProgress;

    const startTime = Date.now();
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const failures: TestFailure[] = [];
    const suiteResults: TestSuiteResult[] = [];
    const logs: string[] = [];

    const hasOnlySuite = this.suites.some((s) => s.only);
    const hasOnlyCase = this.suites.some((s) => s.cases.some((c) => c.only));
    const totalExpected = this.totalCasesCount;

    logs.push('=== LIVE JEST CLIENT TEST SUITE RESULTS ===');
    logs.push(`Timestamp: ${new Date().toISOString()}`);
    logs.push('');

    const matchesFilter = (fullName: string): boolean => {
      if (!filter) return true;
      if (typeof filter === 'string') {
        return fullName.toLowerCase().includes(filter.toLowerCase());
      }
      return filter.test(fullName);
    };

    const emitProgress = (partial: Omit<TestProgressEvent, 'completedCount' | 'totalCount' | 'passedCount' | 'failedCount' | 'skippedCount'>): void => {
      if (!onProgress) return;
      try {
        onProgress({
          ...partial,
          completedCount: passed + failed + skipped,
          totalCount: totalExpected,
          passedCount: passed,
          failedCount: failed,
          skippedCount: skipped
        });
      } catch (_e) {}
    };

    for (const suite of this.suites) {
      if (Date.now() - startTime > maxDurationMs) {
        logs.push(
          `[TIMEOUT] Hard deadline limit (${maxDurationMs}ms) reached. Aborting remaining test suites.`
        );
        break;
      }

      const suiteStart = Date.now();
      const suiteCasesResults: TestCaseResult[] = [];
      let suitePassed = 0;
      let suiteFailed = 0;
      let suiteSkipped = 0;

      logs.push(`--- SUITE: ${suite.name} ---`);
      emitProgress({ type: 'suite_start', suiteName: suite.name });

      const shouldSkipWholeSuite = Boolean(suite.skip || (hasOnlySuite && !suite.only));

      let beforeAllError: Error | null = null;
      if (!shouldSkipWholeSuite && suite.beforeAllHooks.length > 0) {
        for (const hook of suite.beforeAllHooks) {
          try {
            await this.executeWithTimeout(hook, defaultTestTimeoutMs, 'beforeAll hook');
          } catch (err: any) {
            beforeAllError = err instanceof Error ? err : new Error(String(err));
            break;
          }
        }
      }

      for (const testCase of suite.cases) {
        if (Date.now() - startTime > maxDurationMs) {
          logs.push(
            `[TIMEOUT] Hard deadline limit (${maxDurationMs}ms) reached. Aborting remaining tests.`
          );
          break;
        }

        const fullName = `${suite.name} > ${testCase.name}`;
        const shouldSkipCase =
          shouldSkipWholeSuite ||
          Boolean(testCase.skip) ||
          (hasOnlyCase && !suite.only && !testCase.only) ||
          !matchesFilter(fullName);

        if (shouldSkipCase) {
          skipped++;
          suiteSkipped++;
          suiteCasesResults.push({
            suiteName: suite.name,
            testName: testCase.name,
            status: 'skipped',
            durationMs: 0
          });
          logs.push(`[SKIPPED] ${fullName}`);
          emitProgress({
            type: 'test_complete',
            suiteName: suite.name,
            testName: testCase.name,
            status: 'skipped'
          });
          continue;
        }

        total++;
        const caseStart = Date.now();
        const caseTimeout = testCase.timeoutMs ?? defaultTestTimeoutMs;

        emitProgress({
          type: 'test_start',
          suiteName: suite.name,
          testName: testCase.name
        });

        if (typeof document !== 'undefined') {
          await new Promise<void>((resolve) => setTimeout(resolve, 8));
        }

        try {
          if (beforeAllError) {
            throw beforeAllError;
          }

          for (const beforeHook of suite.beforeEachHooks) {
            await this.executeWithTimeout(beforeHook, caseTimeout, 'beforeEach hook');
          }

          let testExecError: any = null;
          try {
            await this.executeWithTimeout(testCase.fn, caseTimeout, 'Test');
          } catch (err) {
            testExecError = err;
          }

          let afterEachError: any = null;
          for (const afterHook of suite.afterEachHooks) {
            try {
              await this.executeWithTimeout(afterHook, caseTimeout, 'afterEach hook');
            } catch (err) {
              if (!afterEachError) afterEachError = err;
            }
          }

          if (testExecError) {
            throw testExecError;
          }
          if (afterEachError) {
            throw afterEachError;
          }

          const caseDuration = Date.now() - caseStart;
          passed++;
          suitePassed++;
          suiteCasesResults.push({
            suiteName: suite.name,
            testName: testCase.name,
            status: 'passed',
            durationMs: caseDuration
          });
          logs.push(`[PASSED] ${fullName}`);
          emitProgress({
            type: 'test_complete',
            suiteName: suite.name,
            testName: testCase.name,
            status: 'passed'
          });
        } catch (err: any) {
          const caseDuration = Date.now() - caseStart;
          failed++;
          suiteFailed++;
          const errorObj = err instanceof Error ? err : new Error(String(err));
          failures.push({ suiteName: suite.name, testName: testCase.name, error: errorObj });
          suiteCasesResults.push({
            suiteName: suite.name,
            testName: testCase.name,
            status: 'failed',
            durationMs: caseDuration,
            error: errorObj
          });
          logs.push(`[FAILED] ${fullName}`);
          logs.push(`  Error: ${errorObj.message}`);
          if (errorObj.stack) {
            logs.push(
              `  Stack Trace:\n${errorObj.stack
                .split('\n')
                .map((l) => '    ' + l)
                .join('\n')}`
            );
          }
          logs.push('');
          emitProgress({
            type: 'test_complete',
            suiteName: suite.name,
            testName: testCase.name,
            status: 'failed',
            error: errorObj
          });
        }
      }

      if (!shouldSkipWholeSuite && suite.afterAllHooks.length > 0) {
        for (const hook of suite.afterAllHooks) {
          try {
            await this.executeWithTimeout(hook, defaultTestTimeoutMs, 'afterAll hook');
          } catch (err: any) {
            failed++;
            suiteFailed++;
            const errorObj = err instanceof Error ? err : new Error(String(err));
            failures.push({
              suiteName: suite.name,
              testName: 'afterAll',
              error: errorObj
            });
            logs.push(`[FAILED] ${suite.name} > afterAll`);
            logs.push(`  Error: ${errorObj.message}`);
          }
        }
      }

      suiteResults.push({
        suiteName: suite.name,
        passed: suitePassed,
        failed: suiteFailed,
        skipped: suiteSkipped,
        durationMs: Date.now() - suiteStart,
        cases: suiteCasesResults
      });
      logs.push('');
      emitProgress({ type: 'suite_complete', suiteName: suite.name });
    }

    const durationMs = Date.now() - startTime;
    logs.unshift(
      `SUMMARY: Total: ${total} | Passed: ${passed} | Failed: ${failed}${skipped > 0 ? ` | Skipped: ${skipped}` : ''}\n`
    );

    return {
      total,
      passed,
      failed,
      skipped,
      durationMs,
      failures,
      suiteResults,
      logOutput: logs.join('\n')
    };
  }

  public static assertEquals<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message || `Assertion failed: expected '${expected}', got '${actual}'`);
    }
  }

  public static assertTrue(value: boolean, message?: string): void {
    if (value !== true) {
      throw new Error(message || `Assertion failed: expected true, got ${value}`);
    }
  }

  public static assertFalse(value: boolean, message?: string): void {
    if (value !== false) {
      throw new Error(message || `Assertion failed: expected false, got ${value}`);
    }
  }

  public static assertNotNull<T>(value: T | null | undefined, message?: string): T {
    if (value === null || value === undefined) {
      throw new Error(message || 'Assertion failed: value is null or undefined');
    }
    return value;
  }
}

export interface DescribeFunction {
  (suiteName: string, fn: () => void): void;
  skip: (suiteName: string, fn: () => void) => void;
  only: (suiteName: string, fn: () => void) => void;
}

export interface ItFunction {
  (testName: string, fn: TestCaseFn, timeoutMs?: number): void;
  skip: (testName: string, fn?: TestCaseFn, timeoutMs?: number) => void;
  only: (testName: string, fn: TestCaseFn, timeoutMs?: number) => void;
  todo: (testName: string) => void;
}

const describeBase = function (suiteName: string, fn: () => void): void {
  const runner = TestRunner.getInstance();
  runner.registerSuite(suiteName, () => {
    fn();
  });
} as DescribeFunction;

describeBase.skip = (suiteName: string, fn: () => void): void => {
  const runner = TestRunner.getInstance();
  runner.registerSuite(
    suiteName,
    () => {
      fn();
    },
    { skip: true }
  );
};

describeBase.only = (suiteName: string, fn: () => void): void => {
  const runner = TestRunner.getInstance();
  runner.registerSuite(
    suiteName,
    () => {
      fn();
    },
    { only: true }
  );
};

export const describe: DescribeFunction = describeBase;

const itBase = function (testName: string, fn: TestCaseFn, timeoutMs?: number): void {
  const runner = TestRunner.getInstance();
  const suiteName = runner.getCurrentSuiteName();
  runner.addCase(suiteName, testName, fn, { timeoutMs });
} as ItFunction;

itBase.skip = (testName: string, fn?: TestCaseFn, timeoutMs?: number): void => {
  const runner = TestRunner.getInstance();
  const suiteName = runner.getCurrentSuiteName();
  runner.addCase(suiteName, testName, fn || (() => {}), { timeoutMs, skip: true });
};

itBase.only = (testName: string, fn: TestCaseFn, timeoutMs?: number): void => {
  const runner = TestRunner.getInstance();
  const suiteName = runner.getCurrentSuiteName();
  runner.addCase(suiteName, testName, fn, { timeoutMs, only: true });
};

itBase.todo = (testName: string): void => {
  const runner = TestRunner.getInstance();
  const suiteName = runner.getCurrentSuiteName();
  runner.addCase(suiteName, testName, () => {}, { skip: true });
};

export const it: ItFunction = itBase;
export const test: ItFunction = itBase;

export function beforeAll(fn: LifecycleHookFn): void {
  TestRunner.getInstance().addBeforeAll(fn);
}

export function afterAll(fn: LifecycleHookFn): void {
  TestRunner.getInstance().addAfterAll(fn);
}

export function beforeEach(fn: LifecycleHookFn): void {
  TestRunner.getInstance().addBeforeEach(fn);
}

export function afterEach(fn: LifecycleHookFn): void {
  TestRunner.getInstance().addAfterEach(fn);
}

export function installJestGlobals(target: any = globalThis): void {
  if (!target) return;
  target.describe = describe;
  target.it = it;
  target.test = test;
  target.expect = expect;
  target.beforeAll = beforeAll;
  target.afterAll = afterAll;
  target.beforeEach = beforeEach;
  target.afterEach = afterEach;
  target.jest = jest;
}
