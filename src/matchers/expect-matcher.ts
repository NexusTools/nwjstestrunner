import { AsyncExpectMatcher, ExpectMatcher } from '../types/test-runner-types';
import { DeepEqualityHelper } from './deep-equality-helper';

export class ExpectMatcherBuilder {
  public static createMatcher(actual: any, isNot = false): ExpectMatcher {
    const check = (condition: boolean, msg: string): void => {
      const pass = isNot ? !condition : condition;
      if (!pass) {
        throw new Error(msg);
      }
    };

    const notPrefix = isNot ? 'not.' : '';
    const fmt = DeepEqualityHelper.formatValue;

    const verifyErrorMatch = (
      caughtError: any,
      expectedError?: string | RegExp | Error | (new (...args: any[]) => Error)
    ): boolean => {
      if (expectedError === undefined) {
        return true;
      }
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : typeof caughtError === 'string'
            ? caughtError
            : String(caughtError);

      if (typeof expectedError === 'string') {
        return message.includes(expectedError);
      }
      if (expectedError instanceof RegExp) {
        return expectedError.test(message);
      }
      if (expectedError instanceof Error) {
        return message.includes(expectedError.message);
      }
      if (typeof expectedError === 'function') {
        return caughtError instanceof expectedError;
      }
      return false;
    };

    const matchers: ExpectMatcher = {
      toBe(expected: any): void {
        check(
          Object.is(actual, expected) || actual === expected,
          `expect(${fmt(actual)}).${notPrefix}toBe(${fmt(expected)}) failed`
        );
      },

      toEqual(expected: any): void {
        const match = DeepEqualityHelper.deepEquals(actual, expected, false);
        check(match, `expect(${fmt(actual)}).${notPrefix}toEqual(${fmt(expected)}) failed`);
      },

      toStrictEqual(expected: any): void {
        const match = DeepEqualityHelper.deepEquals(actual, expected, true);
        check(match, `expect(${fmt(actual)}).${notPrefix}toStrictEqual(${fmt(expected)}) failed`);
      },

      toBeTruthy(): void {
        check(Boolean(actual) === true, `expect(${fmt(actual)}).${notPrefix}toBeTruthy() failed`);
      },

      toBeFalsy(): void {
        check(Boolean(actual) === false, `expect(${fmt(actual)}).${notPrefix}toBeFalsy() failed`);
      },

      toBeNull(): void {
        check(actual === null, `expect(${fmt(actual)}).${notPrefix}toBeNull() failed`);
      },

      toBeUndefined(): void {
        check(actual === undefined, `expect(${fmt(actual)}).${notPrefix}toBeUndefined() failed`);
      },

      toBeDefined(): void {
        check(
          actual !== undefined && actual !== null,
          `expect(${fmt(actual)}).${notPrefix}toBeDefined() failed`
        );
      },

      toBeNaN(): void {
        check(Number.isNaN(actual), `expect(${fmt(actual)}).${notPrefix}toBeNaN() failed`);
      },

      toBeInstanceOf(expectedConstructor: any): void {
        const isInst =
          typeof expectedConstructor === 'function' && actual instanceof expectedConstructor;
        const ctorName = expectedConstructor?.name || fmt(expectedConstructor);
        check(
          isInst,
          `expect(${fmt(actual)}).${notPrefix}toBeInstanceOf(${ctorName}) failed`
        );
      },

      toBeGreaterThan(expected: number | bigint): void {
        check(
          actual > expected,
          `expect(${fmt(actual)}).${notPrefix}toBeGreaterThan(${fmt(expected)}) failed`
        );
      },

      toBeGreaterThanOrEqual(expected: number | bigint): void {
        check(
          actual >= expected,
          `expect(${fmt(actual)}).${notPrefix}toBeGreaterThanOrEqual(${fmt(expected)}) failed`
        );
      },

      toBeLessThan(expected: number | bigint): void {
        check(
          actual < expected,
          `expect(${fmt(actual)}).${notPrefix}toBeLessThan(${fmt(expected)}) failed`
        );
      },

      toBeLessThanOrEqual(expected: number | bigint): void {
        check(
          actual <= expected,
          `expect(${fmt(actual)}).${notPrefix}toBeLessThanOrEqual(${fmt(expected)}) failed`
        );
      },

      toBeCloseTo(expected: number, numDigits = 2): void {
        const precision = Math.pow(10, -numDigits) / 2;
        const diff = Math.abs(Number(actual) - expected);
        check(
          !Number.isNaN(diff) && diff < precision,
          `expect(${fmt(actual)}).${notPrefix}toBeCloseTo(${fmt(expected)}, ${numDigits}) failed`
        );
      },

      toContain(item: any): void {
        let contains = false;
        if (typeof actual === 'string') {
          contains = actual.includes(String(item));
        } else if (Array.isArray(actual)) {
          contains = actual.includes(item);
        } else if (actual instanceof Set) {
          contains = actual.has(item);
        } else if (actual && typeof actual[Symbol.iterator] === 'function') {
          for (const entry of actual) {
            if (entry === item) {
              contains = true;
              break;
            }
          }
        }
        check(contains, `expect(${fmt(actual)}).${notPrefix}toContain(${fmt(item)}) failed`);
      },

      toContainEqual(item: any): void {
        let contains = false;
        if (Array.isArray(actual) || (actual && typeof actual[Symbol.iterator] === 'function')) {
          for (const entry of actual) {
            if (DeepEqualityHelper.deepEquals(entry, item)) {
              contains = true;
              break;
            }
          }
        }
        check(
          contains,
          `expect(${fmt(actual)}).${notPrefix}toContainEqual(${fmt(item)}) failed`
        );
      },

      toHaveLength(expectedLength: number): void {
        const actualLen = actual !== null && actual !== undefined ? actual.length : undefined;
        check(
          actualLen === expectedLength,
          `expect(${fmt(actual)}).${notPrefix}toHaveLength(${expectedLength}) failed (received length: ${fmt(actualLen)})`
        );
      },

      toHaveProperty(keyPath: string | string[], expectedValue?: any): void {
        const resolved = DeepEqualityHelper.resolvePropertyPath(actual, keyPath);
        const hasValueCheck = arguments.length >= 2;
        const passCondition =
          resolved.exists &&
          (!hasValueCheck || DeepEqualityHelper.deepEquals(resolved.value, expectedValue));
        check(
          passCondition,
          `expect(${fmt(actual)}).${notPrefix}toHaveProperty(${fmt(keyPath)}${hasValueCheck ? `, ${fmt(expectedValue)}` : ''}) failed`
        );
      },

      toMatch(expected: string | RegExp): void {
        const str = typeof actual === 'string' ? actual : String(actual ?? '');
        const matched =
          expected instanceof RegExp ? expected.test(str) : str.includes(String(expected));
        check(matched, `expect(${fmt(actual)}).${notPrefix}toMatch(${fmt(expected)}) failed`);
      },

      toMatchObject(expected: Record<string, any> | any[]): void {
        const matched = DeepEqualityHelper.matchesObject(actual, expected);
        check(
          matched,
          `expect(${fmt(actual)}).${notPrefix}toMatchObject(${fmt(expected)}) failed`
        );
      },

      toThrow(expectedError?: string | RegExp | Error | (new (...args: any[]) => Error)): void {
        let threw = false;
        let caught: any;
        if (typeof actual === 'function') {
          try {
            actual();
          } catch (err) {
            threw = true;
            caught = err;
          }
        }
        const matched = threw && verifyErrorMatch(caught, expectedError);
        check(
          matched,
          `expect(fn).${notPrefix}toThrow(${expectedError !== undefined ? fmt(expectedError) : ''}) failed: ${
            !threw
              ? 'function did not throw'
              : `threw ${fmt(caught)} which did not match ${fmt(expectedError)}`
          }`
        );
      },

      toHaveBeenCalled(): void {
        if (!actual || !actual._isMockFunction || !actual.mock) {
          throw new Error('expect(fn).toHaveBeenCalled() requires a mock/spy function');
        }
        check(
          actual.mock.calls.length > 0,
          `expect(mockFn).${notPrefix}toHaveBeenCalled() failed (called ${actual.mock.calls.length} times)`
        );
      },

      toHaveBeenCalledTimes(expectedCount: number): void {
        if (!actual || !actual._isMockFunction || !actual.mock) {
          throw new Error('expect(fn).toHaveBeenCalledTimes() requires a mock/spy function');
        }
        check(
          actual.mock.calls.length === expectedCount,
          `expect(mockFn).${notPrefix}toHaveBeenCalledTimes(${expectedCount}) failed (called ${actual.mock.calls.length} times)`
        );
      },

      toHaveBeenCalledWith(...expectedArgs: any[]): void {
        if (!actual || !actual._isMockFunction || !actual.mock) {
          throw new Error('expect(fn).toHaveBeenCalledWith() requires a mock/spy function');
        }
        const matched = actual.mock.calls.some((callArgs: any[]) =>
          DeepEqualityHelper.deepEquals(callArgs, expectedArgs)
        );
        check(
          matched,
          `expect(mockFn).${notPrefix}toHaveBeenCalledWith(${expectedArgs.map(fmt).join(', ')}) failed (calls: ${fmt(actual.mock.calls)})`
        );
      },

      toHaveBeenLastCalledWith(...expectedArgs: any[]): void {
        if (!actual || !actual._isMockFunction || !actual.mock) {
          throw new Error('expect(fn).toHaveBeenLastCalledWith() requires a mock/spy function');
        }
        const lastCall = actual.mock.lastCall;
        const matched =
          actual.mock.calls.length > 0 && DeepEqualityHelper.deepEquals(lastCall, expectedArgs);
        check(
          matched,
          `expect(mockFn).${notPrefix}toHaveBeenLastCalledWith(${expectedArgs.map(fmt).join(', ')}) failed (lastCall: ${fmt(lastCall)})`
        );
      },

      get not(): ExpectMatcher {
        return ExpectMatcherBuilder.createMatcher(actual, !isNot);
      },

      get resolves(): AsyncExpectMatcher {
        return ExpectMatcherBuilder.createAsyncMatcher(actual, 'resolves', false);
      },

      get rejects(): AsyncExpectMatcher {
        return ExpectMatcherBuilder.createAsyncMatcher(actual, 'rejects', false);
      }
    };

    return matchers;
  }

  public static createAsyncMatcher(
    promiseOrFn: any,
    mode: 'resolves' | 'rejects',
    isNot = false
  ): AsyncExpectMatcher {
    const awaitTarget = async (): Promise<any> => {
      const targetPromise =
        typeof promiseOrFn === 'function' ? Promise.resolve().then(() => promiseOrFn()) : Promise.resolve(promiseOrFn);

      if (mode === 'resolves') {
        try {
          return await targetPromise;
        } catch (err) {
          throw new Error(
            `expect(promise).resolves failed because promise rejected with: ${DeepEqualityHelper.formatValue(err)}`
          );
        }
      } else {
        let didReject = false;
        let rejectedVal: any;
        try {
          await targetPromise;
        } catch (err) {
          didReject = true;
          rejectedVal = err;
        }
        if (!didReject) {
          throw new Error('expect(promise).rejects failed because promise resolved instead of rejecting');
        }
        return rejectedVal;
      }
    };

    const runSyncMatcher = async (
      invoke: (syncMatcher: ExpectMatcher, resolvedValue: any) => void
    ): Promise<void> => {
      const val = await awaitTarget();
      const syncMatcher = ExpectMatcherBuilder.createMatcher(val, isNot);
      invoke(syncMatcher, val);
    };

    return {
      toBe: (expected: any) => runSyncMatcher((m) => m.toBe(expected)),
      toEqual: (expected: any) => runSyncMatcher((m) => m.toEqual(expected)),
      toStrictEqual: (expected: any) => runSyncMatcher((m) => m.toStrictEqual(expected)),
      toBeTruthy: () => runSyncMatcher((m) => m.toBeTruthy()),
      toBeFalsy: () => runSyncMatcher((m) => m.toBeFalsy()),
      toBeNull: () => runSyncMatcher((m) => m.toBeNull()),
      toBeUndefined: () => runSyncMatcher((m) => m.toBeUndefined()),
      toBeDefined: () => runSyncMatcher((m) => m.toBeDefined()),
      toContain: (item: any) => runSyncMatcher((m) => m.toContain(item)),
      toMatch: (expected: string | RegExp) => runSyncMatcher((m) => m.toMatch(expected)),
      toMatchObject: (expected: Record<string, any> | any[]) =>
        runSyncMatcher((m) => m.toMatchObject(expected)),
      toThrow: async (expectedError?: string | RegExp | Error | (new (...args: any[]) => Error)) => {
        const val = await awaitTarget();
        const syncMatcher = ExpectMatcherBuilder.createMatcher(() => {
          throw val;
        }, isNot);
        syncMatcher.toThrow(expectedError);
      },
      get not(): AsyncExpectMatcher {
        return ExpectMatcherBuilder.createAsyncMatcher(promiseOrFn, mode, !isNot);
      }
    };
  }
}

export function expect(actual: any): ExpectMatcher {
  return ExpectMatcherBuilder.createMatcher(actual, false);
}
