// Text rendering for tasks.

export function formatTask(task) {
  const due = task.due ? ` (due ${task.due})` : '';
  return `${task.done ? '[x]' : '[ ]'} #${task.id} ${task.title}${due}`;
}

export function formatList(tasks) {
  return tasks.length === 0 ? 'No tasks.' : tasks.map(formatTask).join('\n');
}
