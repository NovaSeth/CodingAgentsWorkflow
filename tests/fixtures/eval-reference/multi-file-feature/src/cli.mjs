// Command-line front end: run(argv, store, now) executes one command and returns the text to print.
import { formatList, formatTask } from './format.mjs';

const pad = (n) => String(n).padStart(2, '0');

function isCalendarDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isoDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function splitDue(args) {
  const at = args.indexOf('--due');
  if (at === -1) return { words: args, due: null };
  return { words: [...args.slice(0, at), ...args.slice(at + 2)], due: args[at + 1] ?? '' };
}

export function run(argv, store, now = new Date()) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'add': {
      const { words, due } = splitDue(rest);
      if (due !== null && !isCalendarDate(due)) return `error: invalid due date "${due}" (expected YYYY-MM-DD)`;
      const title = words.join(' ').trim();
      if (!title) return 'error: title required';
      return `added ${formatTask(store.add(title, due))}`;
    }
    case 'done': {
      const task = store.complete(Number(rest[0]));
      return task ? `completed ${formatTask(task)}` : `error: no task ${rest[0]}`;
    }
    case 'list': {
      const today = isoDay(now);
      const tasks = rest.includes('--overdue')
        ? store.all().filter((task) => !task.done && task.due !== null && task.due < today)
        : store.all();
      return formatList(tasks);
    }
    default:
      return 'usage: tasks <add|done|list> ...';
  }
}
