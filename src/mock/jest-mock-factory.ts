import { MockFunction, MockState } from '../types/test-runner-types';

export class JestMockFactory {
  private static activeMocks = new Set<MockFunction<any, any>>();
  private static activeSpies = new Set<() => void>();

  public static fn<TArgs extends any[] = any[], TReturn = any>(
    initialImpl?: (...args: TArgs) => TReturn
  ): MockFunction<TArgs, TReturn> {
    let defaultImpl: ((...args: TArgs) => TReturn) | undefined = initialImpl;
    const onceImplQueue: Array<(...args: TArgs) => TReturn> = [];

    const mockState: MockState<TArgs, TReturn> = {
      calls: [],
      results: [],
      instances: [],
      lastCall: undefined
    };

    const mockFn = function (this: any, ...args: TArgs): TReturn {
      mockState.calls.push(args);
      mockState.lastCall = args;
      mockState.instances.push(this);

      const impl = onceImplQueue.length > 0 ? onceImplQueue.shift()! : defaultImpl;
      if (!impl) {
        mockState.results.push({ type: 'return', value: undefined as any });
        return undefined as any;
      }

      try {
        const result = impl.apply(this, args);
        mockState.results.push({ type: 'return', value: result });
        return result;
      } catch (err) {
        mockState.results.push({ type: 'throw', value: err as any });
        throw err;
      }
    } as unknown as MockFunction<TArgs, TReturn>;

    mockFn._isMockFunction = true;
    mockFn.mock = mockState;

    mockFn.mockImplementation = (fn: (...args: TArgs) => TReturn) => {
      defaultImpl = fn;
      return mockFn;
    };

    mockFn.mockImplementationOnce = (fn: (...args: TArgs) => TReturn) => {
      onceImplQueue.push(fn);
      return mockFn;
    };

    mockFn.mockReturnValue = (value: TReturn) => {
      defaultImpl = () => value;
      return mockFn;
    };

    mockFn.mockReturnValueOnce = (value: TReturn) => {
      onceImplQueue.push(() => value);
      return mockFn;
    };

    mockFn.mockResolvedValue = (value: Awaited<TReturn>) => {
      defaultImpl = () => Promise.resolve(value) as unknown as TReturn;
      return mockFn;
    };

    mockFn.mockResolvedValueOnce = (value: Awaited<TReturn>) => {
      onceImplQueue.push(() => Promise.resolve(value) as unknown as TReturn);
      return mockFn;
    };

    mockFn.mockRejectedValue = (err: any) => {
      defaultImpl = () => Promise.reject(err) as unknown as TReturn;
      return mockFn;
    };

    mockFn.mockRejectedValueOnce = (err: any) => {
      onceImplQueue.push(() => Promise.reject(err) as unknown as TReturn);
      return mockFn;
    };

    mockFn.mockClear = () => {
      mockState.calls = [];
      mockState.results = [];
      mockState.instances = [];
      mockState.lastCall = undefined;
      return mockFn;
    };

    mockFn.mockReset = () => {
      mockFn.mockClear();
      defaultImpl = undefined;
      onceImplQueue.length = 0;
      return mockFn;
    };

    mockFn.mockRestore = () => {
      mockFn.mockReset();
    };

    JestMockFactory.activeMocks.add(mockFn);
    return mockFn;
  }

  public static spyOn<T extends object, K extends keyof T>(
    target: T,
    methodName: K
  ): MockFunction<any[], any> {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
      throw new Error('jest.spyOn() requires a valid target object');
    }

    const originalDescriptor = Object.getOwnPropertyDescriptor(target, methodName);
    const originalMethod = target[methodName];
    if (typeof originalMethod !== 'function') {
      throw new Error(`Cannot spyOn('${String(methodName)}'): property is not a function`);
    }

    const spy = JestMockFactory.fn((...args: any[]) => originalMethod.apply(target, args));

    const restore = () => {
      if (originalDescriptor) {
        Object.defineProperty(target, methodName, originalDescriptor);
      } else {
        (target as any)[methodName] = originalMethod;
      }
      JestMockFactory.activeSpies.delete(restore);
    };

    spy.mockRestore = restore;
    JestMockFactory.activeSpies.add(restore);

    (target as any)[methodName] = spy;
    return spy;
  }

  public static isMockFunction(fn: any): fn is MockFunction<any, any> {
    return Boolean(fn && fn._isMockFunction === true);
  }

  public static clearAllMocks(): void {
    for (const m of JestMockFactory.activeMocks) {
      m.mockClear();
    }
  }

  public static resetAllMocks(): void {
    for (const m of JestMockFactory.activeMocks) {
      m.mockReset();
    }
  }

  public static restoreAllMocks(): void {
    for (const restore of Array.from(JestMockFactory.activeSpies)) {
      restore();
    }
    JestMockFactory.clearAllMocks();
  }
}

export const jest = {
  fn: JestMockFactory.fn,
  spyOn: JestMockFactory.spyOn,
  isMockFunction: JestMockFactory.isMockFunction,
  clearAllMocks: JestMockFactory.clearAllMocks,
  resetAllMocks: JestMockFactory.resetAllMocks,
  restoreAllMocks: JestMockFactory.restoreAllMocks
};
