import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { NwjsCliLauncher } from '../cli/nwjs-cli-launcher';
import { HarnessConfigLoader } from '../config/harness-config-loader';
import { TestRunner } from '../core/test-runner';
import { TestHttpServer } from '../harness/test-http-server';
import { TestLogWriter } from '../harness/test-log-writer';
import { DeepEqualityHelper } from '../matchers/deep-equality-helper';
import { expect } from '../matchers/expect-matcher';
import { jest } from '../mock/jest-mock-factory';

export function registerNwjsTestRunnerSuites(runner: TestRunner): void {
  runner.registerSuite('CoreExpectMatchersAndDeepEquality', (suite) => {
    suite.it('evaluates primitive, object, array, Map, Set, and Buffer equality', () => {
      expect(42).toBe(42);
      expect('nwjs').not.toBe('electron');
      expect(NaN).toBeNaN();
      expect(10).not.toBeNaN();
      expect(null).toBeNull();
      expect(undefined).toBeUndefined();
      expect('defined').toBeDefined();
      expect(true).toBeTruthy();
      expect(0).toBeFalsy();

      expect({ a: 1, b: [2, 3], c: { nested: true } }).toEqual({
        a: 1,
        b: [2, 3],
        c: { nested: true }
      });
      expect(new Set(['a', 'b'])).toEqual(new Set(['b', 'a']));
      expect(
        new Map([
          ['k1', 10],
          ['k2', 20]
        ])
      ).toEqual(
        new Map([
          ['k1', 10],
          ['k2', 20]
        ])
      );
      expect(Buffer.from([1, 2, 3])).toEqual(Buffer.from([1, 2, 3]));
      expect(DeepEqualityHelper.deepEquals({ x: 1, y: undefined }, { x: 1 }, false)).toBe(true);
      expect(DeepEqualityHelper.deepEquals({ x: 1, y: undefined }, { x: 1 }, true)).toBe(false);
    });

    suite.it('evaluates numeric comparisons, collections, properties, regex, and toThrow', () => {
      expect(15).toBeGreaterThan(10);
      expect(10).toBeGreaterThanOrEqual(10);
      expect(5).toBeLessThan(8);
      expect(8).toBeLessThanOrEqual(8);
      expect(0.1 + 0.2).toBeCloseTo(0.3, 5);

      expect([10, 20, 30]).toContain(20);
      expect('hello nwjs world').toContain('nwjs');
      expect([{ id: 1 }, { id: 2 }]).toContainEqual({ id: 2 });
      expect([1, 2, 3, 4]).toHaveLength(4);

      const sampleObj = {
        app: {
          window: { width: 1280, height: 850 },
          tags: ['desktop', 'nwjs']
        }
      };
      expect(sampleObj).toHaveProperty('app.window.width', 1280);
      expect(sampleObj).toMatchObject({ app: { window: { width: 1280 } } });
      expect('nwjstestrunner-v1.0.0').toMatch(/^nwjstestrunner-v\d+/);
      expect(new Error('boom')).toBeInstanceOf(Error);

      expect(() => {
        throw new TypeError('Invalid canvas dimension');
      }).toThrow('Invalid canvas');
      expect(() => {
        throw new TypeError('Invalid canvas dimension');
      }).toThrow(TypeError);
      expect(() => 'safe').not.toThrow();
    });

    suite.it('supports async .resolves and .rejects matchers and static TestRunner assertions', async () => {
      await expect(Promise.resolve({ status: 'ok', count: 3 })).resolves.toEqual({
        status: 'ok',
        count: 3
      });
      await expect(Promise.reject(new Error('network timeout'))).rejects.toThrow('network timeout');

      TestRunner.assertEquals(2 + 2, 4);
      TestRunner.assertTrue(true);
      TestRunner.assertFalse(false);
      const nonNull = TestRunner.assertNotNull('value');
      expect(nonNull).toBe('value');
    });
  });

  runner.registerSuite('JestMocksSpiesAndLifecycleHooks', (suite) => {
    const hookEvents: string[] = [];

    suite.beforeAll(() => {
      hookEvents.push('beforeAll');
    });

    suite.beforeEach(() => {
      hookEvents.push('beforeEach');
    });

    suite.afterEach(() => {
      hookEvents.push('afterEach');
    });

    suite.afterAll(() => {
      hookEvents.push('afterAll');
    });

    suite.it('tracks jest.fn() calls, return values, once queues, and async mocks', async () => {
      const fn = jest.fn((a: number, b: number) => a + b);
      expect(fn(2, 3)).toBe(5);
      expect(fn(10, 20)).toBe(30);

      expect(fn).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(2, 3);
      expect(fn).toHaveBeenLastCalledWith(10, 20);

      fn.mockReturnValueOnce(999).mockReturnValue(100);
      expect(fn(1, 1)).toBe(999);
      expect(fn(1, 1)).toBe(100);

      const asyncMock = jest.fn().mockResolvedValueOnce('first').mockResolvedValue('default');
      await expect(asyncMock()).resolves.toBe('first');
      await expect(asyncMock()).resolves.toBe('default');
    });

    suite.it('spies on object methods via jest.spyOn() and restores original implementation', () => {
      const calculator = {
        multiply(x: number, y: number): number {
          return x * y;
        }
      };

      const spy = jest.spyOn(calculator, 'multiply');
      expect(calculator.multiply(3, 4)).toBe(12);
      expect(spy).toHaveBeenCalledWith(3, 4);

      spy.mockReturnValue(42);
      expect(calculator.multiply(3, 4)).toBe(42);

      spy.mockRestore();
      expect(calculator.multiply(3, 4)).toBe(12);
      expect(hookEvents).toEqual(['beforeAll', 'beforeEach', 'afterEach', 'beforeEach']);
    });
  });

  runner.registerSuite('TestLogWriterHttpServerAndConfigLoader', (suite) => {
    suite.it('writes startup interrupted state, progress snapshots, and final summary log', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nwjs-log-test-'));
      try {
        const logPath = path.join(tmpDir, 'test-results', 'desktop-tests.log');
        const writer = new TestLogWriter(logPath, 'Sample App Test Log');

        writer.writeInitialInterruptedBanner();
        expect(fs.existsSync(logPath)).toBe(true);
        expect(fs.readFileSync(logPath, 'utf-8')).toContain('Status: Tests interupted');

        writer.setTotalTests(3);
        writer.setCounts(2, 0);
        writer.writeProgressSnapshot('Tests interupted (Running 2 of 3)');
        expect(fs.readFileSync(logPath, 'utf-8')).toContain('Passed: 2');

        writer.incrementPassed(1);
        const summary = writer.writeFinalSummary();
        expect(summary.exitCode).toBe(0);
        expect(summary.logText).toContain('SUCCESS: All tests completed cleanly.');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    suite.it('serves static files and custom HTTP mock routes via TestHttpServer', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nwjs-http-test-'));
      fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'Hello from TestHttpServer', 'utf-8');

      const notFoundPaths: string[] = [];
      const server = new TestHttpServer({
        projectRootDir: tmpDir,
        onHttp404: (reqPath) => notFoundPaths.push(reqPath),
        routeHandler: (req, res, { reqPath }) => {
          if (req.method === 'GET' && reqPath === '/v1/custom-json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ custom: true }));
            return true;
          }
          return false;
        }
      });

      try {
        const port = await server.start();
        expect(port).toBeGreaterThan(0);

        const fetchText = (urlPath: string): Promise<{ status: number; body: string }> =>
          new Promise((resolve, reject) => {
            http
              .get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
                let body = '';
                res.on('data', (c) => (body += c.toString()));
                res.on('end', () => resolve({ status: res.statusCode || 0, body }));
              })
              .on('error', reject);
          });

        const staticRes = await fetchText('/hello.txt');
        expect(staticRes.status).toBe(200);
        expect(staticRes.body).toBe('Hello from TestHttpServer');

        const apiRes = await fetchText('/v1/custom-json');
        expect(apiRes.status).toBe(200);
        expect(JSON.parse(apiRes.body)).toEqual({ custom: true });

        const missingRes = await fetchText('/missing-file.js');
        expect(missingRes.status).toBe(404);
        expect(notFoundPaths).toContain('/missing-file.js');
      } finally {
        await server.stop();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    suite.it('parses CLI flags and resolves glob test file patterns', () => {
      const parsed = NwjsCliLauncher.parseCliArgs([
        '--project-root',
        './my-app',
        '--config',
        'custom.config.cjs',
        '--filter',
        'Vector',
        '--init-timeout=5000',
        '--timeout=25000',
        'dist/**/*.test.js'
      ]);
      expect(parsed.projectRootDir).toBe('./my-app');
      expect(parsed.configPath).toBe('custom.config.cjs');
      expect(parsed.testFilter).toBe('Vector');
      expect(parsed.initTimeoutMs).toBe(5000);
      expect(parsed.globalTimeoutMs).toBe(25000);
      expect(parsed.testFiles).toEqual(['dist/**/*.test.js']);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nwjs-glob-test-'));
      try {
        const nestedDir = path.join(tmpDir, 'dist', 'tests');
        fs.mkdirSync(nestedDir, { recursive: true });
        const f1 = path.join(nestedDir, 'alpha.test.js');
        const f2 = path.join(nestedDir, 'beta.spec.js');
        fs.writeFileSync(f1, '// test 1', 'utf-8');
        fs.writeFileSync(f2, '// test 2', 'utf-8');

        const discovered = HarnessConfigLoader.resolveTestFiles(tmpDir);
        expect(discovered.length).toBe(2);

        const globMatched = HarnessConfigLoader.resolveTestFiles(tmpDir, ['dist/**/*.test.js']);
        expect(globMatched).toEqual([f1]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
}
