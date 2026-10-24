import * as fs from 'fs';
import * as path from 'path';

export class TestLogWriter {
  private readonly logFilePath: string;
  private readonly headerTitle: string;
  private readonly errorLogs: string[] = [];
  private totalTests = 0;
  private passedCount = 0;
  private failedCount = 0;

  constructor(logFilePath: string, headerTitle = 'NW.js Desktop Client Test Harness Log') {
    this.logFilePath = path.resolve(logFilePath);
    this.headerTitle = headerTitle;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    try {
      fs.mkdirSync(path.dirname(this.logFilePath), { recursive: true });
    } catch (_e) {}
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }

  public getErrorLogs(): ReadonlyArray<string> {
    return this.errorLogs;
  }

  public getMetrics(): { totalTests: number; passedCount: number; failedCount: number } {
    return {
      totalTests: this.totalTests,
      passedCount: this.passedCount,
      failedCount: this.failedCount
    };
  }

  public setTotalTests(total: number): void {
    this.totalTests = Math.max(0, total);
  }

  public setCounts(passed: number, failed: number): void {
    this.passedCount = Math.max(0, passed);
    this.failedCount = Math.max(0, failed);
  }

  public incrementPassed(delta = 1): void {
    this.passedCount += delta;
  }

  public incrementFailed(delta = 1): void {
    this.failedCount += delta;
  }

  public writeInitialInterruptedBanner(): void {
    try {
      this.ensureDirectory();
      const lines = [
        '==================================================',
        this.headerTitle,
        '==================================================',
        `Started at: ${new Date().toISOString()}`,
        'Status: Tests interupted'
      ];
      fs.writeFileSync(this.logFilePath, lines.join('\n'), 'utf-8');
    } catch (_e) {}
  }

  public writeProgressSnapshot(statusLabel = 'Tests interupted'): void {
    try {
      this.ensureDirectory();
      const lines = [
        '==================================================',
        this.headerTitle,
        '==================================================',
        `Updated at: ${new Date().toISOString()}`,
        `Status: ${statusLabel || 'Tests interupted'}`,
        `Total Tests: ${this.totalTests}`,
        `Passed: ${this.passedCount}`,
        `Failed: ${this.failedCount}`,
        '=================================================='
      ];
      if (this.errorLogs.length > 0) {
        lines.push('FAILURES & ERRORS:');
        for (const err of this.errorLogs) {
          lines.push(err);
        }
      }
      fs.writeFileSync(this.logFilePath, lines.join('\n'), 'utf-8');
    } catch (_e) {}
  }

  public recordError(source: string, err: any): string {
    const detail =
      err && typeof err === 'object' && (err.stack || err.message)
        ? err.stack || err.message
        : String(err);
    const errMsg = `[ERROR][${source}] ${detail}`;
    this.errorLogs.push(errMsg);
    console.error(errMsg);
    this.writeProgressSnapshot('Tests interupted (Running with errors)');
    return errMsg;
  }

  public writeFinalSummary(): { exitCode: number; logText: string } {
    const totalPassed = this.passedCount;
    let totalFailed = this.failedCount;

    if (this.totalTests > 0 && totalPassed + totalFailed !== this.totalTests) {
      this.recordError(
        'TestCountMismatchError',
        `Test count mismatch: total expected ${this.totalTests}, but executed passed (${totalPassed}) + failed (${totalFailed}) = ${totalPassed + totalFailed}`
      );
    }

    if (this.errorLogs.length > 0 && totalFailed === 0) {
      totalFailed = 1;
    }

    const totalAll = this.totalTests || totalPassed + totalFailed;
    const testLogLines = [
      '==================================================',
      this.headerTitle,
      '==================================================',
      `Completed at: ${new Date().toISOString()}`,
      `Total Tests: ${totalAll}`,
      `Passed: ${totalPassed}`,
      `Failed: ${totalFailed}`,
      '=================================================='
    ];

    if (this.errorLogs.length > 0) {
      testLogLines.push('FAILURES & ERRORS:');
      for (const err of this.errorLogs) {
        testLogLines.push(err);
      }
    } else {
      testLogLines.push('SUCCESS: All tests completed cleanly.');
    }

    const logText = testLogLines.join('\n');
    try {
      this.ensureDirectory();
      fs.writeFileSync(this.logFilePath, logText, 'utf-8');
    } catch (e) {
      console.error('Failed to write test log:', e);
    }

    const exitCode = this.errorLogs.length > 0 || totalFailed > 0 ? 1 : 0;
    return { exitCode, logText };
  }
}
