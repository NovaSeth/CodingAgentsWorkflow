// In-memory task store. A task is { id, title, done, due }; due is an ISO date string (YYYY-MM-DD) or null.
// See docs/decisions/0001-due-date-storage.md.

export function createStore() {
  const tasks = [];
  let nextId = 1;
  return {
    add(title, due = null) {
      const task = { id: nextId++, title, done: false, due };
      tasks.push(task);
      return { ...task };
    },
    complete(id) {
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) return null;
      task.done = true;
      return { ...task };
    },
    all() {
      return tasks.map((task) => ({ ...task }));
    },
  };
}
