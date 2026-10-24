export class DeepEqualityHelper {
  public static deepEquals(a: any, b: any, strict = false, seen = new Map<any, any>()): boolean {
    if (Object.is(a, b)) {
      return true;
    }

    if (a === null || b === null || a === undefined || b === undefined) {
      return false;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (typeof a !== 'object') {
      return false;
    }

    if (seen.has(a) && seen.get(a) === b) {
      return true;
    }
    seen.set(a, b);

    if (strict && a.constructor !== b.constructor) {
      return false;
    }

    if (a instanceof Date && b instanceof Date) {
      return Object.is(a.getTime(), b.getTime());
    }

    if (a instanceof RegExp && b instanceof RegExp) {
      return a.source === b.source && a.flags === b.flags;
    }

    if (a instanceof Error && b instanceof Error) {
      return a.name === b.name && a.message === b.message;
    }

    if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
      return a.equals(b);
    }

    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
      if (a.byteLength !== b.byteLength) return false;
      const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      for (let i = 0; i < ua.length; i++) {
        if (ua[i] !== ub[i]) return false;
      }
      return true;
    }

    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      for (const [k, v] of a.entries()) {
        if (!b.has(k) || !DeepEqualityHelper.deepEquals(v, b.get(k), strict, seen)) {
          return false;
        }
      }
      return true;
    }

    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const bValues = Array.from(b.values());
      for (const aVal of a.values()) {
        const matchIdx = bValues.findIndex((bVal) => DeepEqualityHelper.deepEquals(aVal, bVal, strict, seen));
        if (matchIdx === -1) return false;
        bValues.splice(matchIdx, 1);
      }
      return true;
    }

    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (strict && (i in a) !== (i in b)) {
          return false;
        }
        if (!DeepEqualityHelper.deepEquals(a[i], b[i], strict, seen)) {
          return false;
        }
      }
      return true;
    }

    const keysA = strict
      ? Reflect.ownKeys(a)
      : Object.keys(a).filter((k) => a[k] !== undefined);
    const keysB = strict
      ? Reflect.ownKeys(b)
      : Object.keys(b).filter((k) => b[k] !== undefined);

    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) {
        if (strict || b[key as any] !== undefined) {
          return false;
        }
      }
      if (!DeepEqualityHelper.deepEquals(a[key as any], b[key as any], strict, seen)) {
        return false;
      }
    }

    return true;
  }

  public static matchesObject(actual: any, expected: any): boolean {
    if (Object.is(actual, expected)) {
      return true;
    }
    if (actual === null || actual === undefined || typeof actual !== 'object') {
      return false;
    }
    if (expected === null || expected === undefined || typeof expected !== 'object') {
      return false;
    }

    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length < expected.length) {
        return false;
      }
      for (let i = 0; i < expected.length; i++) {
        if (!DeepEqualityHelper.matchesObject(actual[i], expected[i])) {
          return false;
        }
      }
      return true;
    }

    for (const key of Object.keys(expected)) {
      if (!(key in actual)) {
        return false;
      }
      const expVal = expected[key];
      const actVal = actual[key];
      if (expVal !== null && typeof expVal === 'object' && !(expVal instanceof RegExp) && !(expVal instanceof Date)) {
        if (!DeepEqualityHelper.matchesObject(actVal, expVal)) {
          return false;
        }
      } else if (!DeepEqualityHelper.deepEquals(actVal, expVal)) {
        return false;
      }
    }

    return true;
  }

  public static resolvePropertyPath(
    target: any,
    keyPath: string | string[]
  ): { exists: boolean; value: any } {
    if (target === null || target === undefined) {
      return { exists: false, value: undefined };
    }
    const segments = Array.isArray(keyPath) ? keyPath : keyPath.split('.');
    let current = target;
    for (const seg of segments) {
      if (current === null || current === undefined) {
        return { exists: false, value: undefined };
      }
      if (typeof current === 'object' || typeof current === 'function') {
        if (!(seg in Object(current))) {
          return { exists: false, value: undefined };
        }
        current = current[seg];
      } else {
        return { exists: false, value: undefined };
      }
    }
    return { exists: true, value: current };
  }

  public static formatValue(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Error) return `[${value.name}: ${value.message}]`;
    try {
      return JSON.stringify(value);
    } catch (_e) {
      return String(value);
    }
  }
}
