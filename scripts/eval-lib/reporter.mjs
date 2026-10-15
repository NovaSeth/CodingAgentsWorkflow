// node:test reporter for the evaluator's trusted test files: one JSON line per finished test, written to the
// --test-reporter-destination file. The trusted process never loads candidate code, so these events are the
// verdicts; candidate output never reaches this file.
export default async function* reporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data ?? {};
    if (data.details?.type === 'suite') continue;
    const error = data.details?.error;
    yield `${JSON.stringify({
      type: event.type === 'test:pass' ? 'pass' : 'fail',
      name: String(data.name ?? ''),
      nesting: data.nesting ?? 0,
      skip: Boolean(data.skip),
      todo: Boolean(data.todo),
      ...(event.type === 'test:fail' && { error: String(error?.cause?.message ?? error?.message ?? error ?? '').slice(0, 2000) }),
    })}\n`;
  }
}
