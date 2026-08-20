function equalTodo(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeTodoSnapshot(currentItems, remoteItems, protectedIds = new Set()) {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  const changedIds = [];
  const conflicts = new Map();

  const items = remoteItems.map((remote) => {
    const current = currentById.get(remote.id);
    if (!current) {
      changedIds.push(remote.id);
      return { ...remote };
    }
    if (equalTodo(current, remote)) return current;
    if (protectedIds.has(remote.id)) {
      conflicts.set(remote.id, { current: { ...remote } });
      return current;
    }
    Object.assign(current, remote);
    changedIds.push(remote.id);
    return current;
  });

  const removedIds = [];
  currentItems.forEach((current) => {
    if (remoteIds.has(current.id)) return;
    if (protectedIds.has(current.id)) {
      conflicts.set(current.id, { current: null });
      items.push(current);
    } else {
      removedIds.push(current.id);
    }
  });

  return { items, changedIds, removedIds, conflicts };
}

export function preserveKeyedTodoNodes({ root, render, previousItems, nextItems, protectedIds = new Set() }) {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const oldNodes = new Map(Array.from(root.querySelectorAll('[data-todo-id]'))
    .map((node) => [node.dataset.todoId, node]));
  render();
  Array.from(root.querySelectorAll('[data-todo-id]')).forEach((freshNode) => {
    const id = freshNode.dataset.todoId;
    const oldNode = oldNodes.get(id);
    if (!oldNode) return;
    const unchanged = equalTodo(previousById.get(id), nextById.get(id));
    if (unchanged || protectedIds.has(id)) freshNode.replaceWith(oldNode);
  });
}

if (typeof window !== 'undefined') {
  window.TodoSync = { mergeTodoSnapshot, preserveKeyedTodoNodes };
}
