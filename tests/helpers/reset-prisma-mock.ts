// The master reset touches about a hundred models. Any model the tests don't set up
// answers every call with undefined, and $transaction runs against the same delegates.
export function createResetPrismaMock() {
  const delegates = new Map<string, Record<string, jest.Mock>>();
  const delegate = (name: string) => {
    if (!delegates.has(name)) {
      const methods = new Map<string, jest.Mock>();
      delegates.set(name, new Proxy({}, {
        get(_target, method: string) {
          if (!methods.has(method)) methods.set(method, jest.fn());
          return methods.get(method);
        },
      }));
    }
    return delegates.get(name)!;
  };

  const tx = new Proxy({}, { get: (_target, name: string) => delegate(`tx.${name}`) });
  const $transaction = jest.fn(async (work: unknown) => (
    typeof work === 'function' ? work(tx) : work
  ));

  return new Proxy({}, {
    get(_target, name: string) {
      if (name === '$transaction') return $transaction;
      if (name === '__tx') return tx;
      return delegate(name);
    },
  });
}
