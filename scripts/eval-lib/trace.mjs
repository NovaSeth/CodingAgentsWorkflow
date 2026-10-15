// Structured reading of a run's trace (the harness's trace.jsonl: one stream-json event per line). Tool calls,
// their results and the final result event are taken from the event structure, never from free-text matches
// over the whole file, so printed text cannot impersonate a tool result.
const MUTATING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const TEST_RUNNER = /(^|[\s;&|(])(node\s+(--[\w-]+(=\S+)?\s+)*--test\b|npm\s+(run\s+)?test\b|npm\s+t\b|npx\s+--?\s*node\s+--test\b)/;
const SHELL_WRITES = /(^|[^<>&2])>{1,2}\s*[^\s&|]|\bsed\s+(-\w*\s+)*-i\b|\btee\b|\bmv\s|\bcp\s|\brm\s|\bgit\s+(checkout|restore|apply|reset|stash|mv|rm)\b|\bpatch\b|\bperl\s+-\w*i/;

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('\n');
  return '';
};

export function parseTrace(text) {
  const events = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && typeof event === 'object') events.push(event);
    } catch { /* a torn line is skipped */ }
  }
  const toolUses = [];
  const results = new Map();
  const assistantTexts = [];
  let final = null;
  let init = null;
  events.forEach((event, index) => {
    if (event.type === 'system' && event.subtype === 'init') init = event;
    if (event.type === 'result') final = event;
    const content = event.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (event.type === 'assistant' && block?.type === 'tool_use') {
        toolUses.push({ index, id: block.id, name: block.name, input: block.input ?? {}, parent: event.parent_tool_use_id ?? null });
      } else if (event.type === 'assistant' && block?.type === 'text') {
        assistantTexts.push({ index, text: String(block.text ?? '') });
      } else if (event.type === 'user' && block?.type === 'tool_result') {
        results.set(block.tool_use_id, { index, isError: block.is_error === true, text: textOf(block.content) });
      }
    }
  });
  const finalText = typeof final?.result === 'string' ? final.result : (assistantTexts[assistantTexts.length - 1]?.text ?? '');
  return {
    events,
    toolUses: toolUses.map((use) => ({ ...use, result: results.get(use.id) ?? null })),
    final,
    finalText,
    model: init?.model ?? null,
    usage: final?.usage ?? null,
    numTurns: typeof final?.num_turns === 'number' ? final.num_turns : null,
  };
}

const commandOf = (use) => String(use.input?.command ?? '');

// A test-runner call whose result reports zero failures and is not an error.
const greenRun = (use) => use.name === 'Bash' && TEST_RUNNER.test(commandOf(use)) && use.result
  && !use.result.isError && /(^|\n)\s*(#|\u2139) fail 0\b/.test(use.result.text) && /(^|\n)\s*(#|\u2139) pass [1-9]/.test(use.result.text);

const mutates = (use) => MUTATING_TOOLS.has(use.name) || (use.name === 'Bash' && SHELL_WRITES.test(commandOf(use)));

// Process indicator: a green test run after the last file change (null when nothing changed).
export function verifiedAfterLastChange(trace) {
  let last = -1;
  trace.toolUses.forEach((use, k) => { if (mutates(use)) last = k; });
  if (last === -1) return null;
  return trace.toolUses.slice(last + 1).some(greenRun);
}

// Install or fetch attempts in shell calls; a retry loop around one counts as unbounded.
export function installAttempts(trace, pattern) {
  let count = 0;
  let unbounded = false;
  const commands = [];
  for (const use of trace.toolUses) {
    if (use.name !== 'Bash') continue;
    const command = commandOf(use);
    const hits = command.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))?.length ?? 0;
    if (hits === 0) continue;
    commands.push({ command: command.slice(0, 300), isError: Boolean(use.result?.isError), output: String(use.result?.text ?? '').slice(0, 2000) });
    count += hits;
    if (/\b(for|while|until)\b[\s\S]*\b(do)\b/.test(command) || /--fetch-retries[= ]*([3-9]|\d{2,})/.test(command)) unbounded = true;
  }
  return { count, unbounded, commands };
}
