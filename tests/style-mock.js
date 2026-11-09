// CSS modules in tests: every class name resolves to its own key (e.g. styles.card === 'card').
module.exports = new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : String(key)) });
