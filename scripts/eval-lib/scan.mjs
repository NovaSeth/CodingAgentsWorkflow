// Streaming search for fixed strings. Every pushed chunk is searched together with the last (longest value - 1)
// characters of the previous ones, so a value split across chunks is found and memory stays bounded however
// much is written. Each occurrence is counted once, in the chunk where its last character arrives.
export function scanner(values) {
  const list = [...new Set(values.filter((v) => typeof v === 'string' && v.length > 0))];
  const counts = Object.fromEntries(list.map((v) => [v, 0]));
  const keep = Math.max(1, ...list.map((v) => v.length)) - 1;
  let carry = '';
  return {
    push(chunk) {
      const text = carry + String(chunk);
      for (const value of list) {
        for (let at = text.indexOf(value); at !== -1; at = text.indexOf(value, at + 1)) {
          if (at + value.length > carry.length) counts[value] += 1;
        }
      }
      carry = keep > 0 ? text.slice(-keep) : '';
    },
    hits: () => ({ ...counts }),
  };
}
