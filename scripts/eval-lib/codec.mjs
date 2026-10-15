// Value codec of the candidate protocol (trusted supervisor <-> candidate host). Every value travels as a
// tagged JSON array, so nothing the candidate returns is ever interpreted as code or as a verdict:
//   ['s', string] ['n', number | 'NaN' | 'Infinity' | '-Infinity' | '-0'] ['b', bool] ['null'] ['u']
//   ['big', digits] ['d', iso | 'Invalid Date'] ['a', [items]] ['o', [[key, value]...], ref?]
//   ['e', {name, message, code}]   an Error value (returned, not thrown)
//   ['h', id, 'function' | 'object']   a reference to a live candidate value (call it / invoke its methods)
//   ['cb', id]   a supervisor callback (the host records its calls; the supervisor replays them)
//   ['cycle'] ['cut']   a cycle, or a value past the depth or size limit
// The side that owns live values decides how functions, handles and callbacks map (hooks below).
export const LIMITS = { depth: 64, nodes: 200000 };

const isPlainObject = (v) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function encodeNumber(n) {
  if (Number.isNaN(n)) return ['n', 'NaN'];
  if (n === Infinity) return ['n', 'Infinity'];
  if (n === -Infinity) return ['n', '-Infinity'];
  if (Object.is(n, -0)) return ['n', '-0'];
  return ['n', n];
}

// hooks: { fn(value) -> encoded | undefined, object(value) -> encoded | undefined, ref(value) -> id | undefined }
export function encode(value, hooks = {}) {
  let nodes = 0;
  const seen = new WeakSet();
  const walk = (v, depth) => {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) return ['cut'];
    switch (typeof v) {
      case 'string': return ['s', v];
      case 'number': return encodeNumber(v);
      case 'boolean': return ['b', v];
      case 'undefined': return ['u'];
      case 'bigint': return ['big', String(v)];
      case 'symbol': return ['s', String(v)];
      case 'function': return hooks.fn ? hooks.fn(v) : ['u'];
      default: break;
    }
    if (v === null) return ['null'];
    if (seen.has(v)) return ['cycle'];
    const known = hooks.ref?.(v);
    if (known !== undefined) return known;
    if (v instanceof Date) return ['d', Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()];
    if (v instanceof Error) return ['e', { name: String(v.name), message: String(v.message), ...(v.code !== undefined && { code: String(v.code) }) }];
    seen.add(v);
    try {
      if (Array.isArray(v)) return ['a', v.map((item) => walk(item, depth + 1))];
      if (isPlainObject(v)) {
        const entries = [];
        for (const key of Object.keys(v)) {
          let item;
          try { item = v[key]; } catch { item = undefined; }
          entries.push([key, walk(item, depth + 1)]);
        }
        const ref = hooks.plainRef?.(v, entries);
        return ref === undefined ? ['o', entries] : ['o', entries, ref];
      }
      return hooks.object ? hooks.object(v) : ['u'];
    } finally {
      seen.delete(v);
    }
  };
  return walk(value, 0);
}

// hooks: { handle(id, kind) -> value, callback(id) -> value, plainRef(object, ref) }
export function decode(encoded, hooks = {}) {
  let nodes = 0;
  const walk = (e, depth) => {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw new TypeError('encoded value too large or too deep');
    if (!Array.isArray(e) || typeof e[0] !== 'string') throw new TypeError('malformed encoded value');
    switch (e[0]) {
      case 's': return String(e[1]);
      case 'n': {
        const n = e[1];
        if (n === 'NaN') return NaN;
        if (n === 'Infinity') return Infinity;
        if (n === '-Infinity') return -Infinity;
        if (n === '-0') return -0;
        if (typeof n !== 'number') throw new TypeError('malformed number');
        return n;
      }
      case 'b': return e[1] === true;
      case 'null': return null;
      case 'u': return undefined;
      case 'big': return BigInt(String(e[1]));
      case 'd': return new Date(e[1] === 'Invalid Date' ? NaN : String(e[1]));
      case 'e': {
        const info = e[1] ?? {};
        const err = new Error(String(info.message ?? ''));
        err.name = String(info.name ?? 'Error');
        if (info.code !== undefined) err.code = String(info.code);
        return err;
      }
      case 'a': {
        if (!Array.isArray(e[1])) throw new TypeError('malformed array');
        return e[1].map((item) => walk(item, depth + 1));
      }
      case 'o': {
        if (!Array.isArray(e[1])) throw new TypeError('malformed object');
        const out = {};
        for (const pair of e[1]) {
          if (!Array.isArray(pair) || typeof pair[0] !== 'string') throw new TypeError('malformed object entry');
          if (pair[0] === '__proto__') continue;
          out[pair[0]] = walk(pair[1], depth + 1);
        }
        if (e[2] !== undefined) hooks.plainRef?.(out, e[2]);
        return out;
      }
      case 'h':
        if (!hooks.handle) throw new TypeError('unexpected handle');
        return hooks.handle(Number(e[1]), String(e[2] ?? 'object'));
      case 'cb':
        if (!hooks.callback) throw new TypeError('unexpected callback');
        return hooks.callback(Number(e[1]));
      case 'cycle':
      case 'cut':
        return undefined;
      default:
        throw new TypeError(`unknown tag ${e[0]}`);
    }
  };
  return walk(encoded, 0);
}
