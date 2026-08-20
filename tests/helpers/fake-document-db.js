function changes(count) {
  return { meta: { changes: count } };
}

function sortedDirectories(items) {
  return items.slice().sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

function sortedDocuments(items) {
  return items.slice().sort((a, b) =>
    b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)
  );
}

export function createDocumentDb(options = {}) {
  const state = {
    currentUserId: options.currentUserId || 'user-1',
    users: options.users || [
      { id: 'user-1', username: 'alice' },
      { id: 'user-2', username: 'bob' },
    ],
    initializedUsers: new Set(options.initializedUsers || []),
    todos: structuredClone(options.todos || []),
    directories: structuredClone(options.directories || []),
    documents: structuredClone(options.documents || []),
    revisions: structuredClone(options.revisions || {}),
  };

  function bumpRevision(userId, key) {
    const row = state.revisions[userId] ||= {
      todos_revision: 0, directories_revision: 0, documents_revision: 0,
    };
    row[key] = Number(row[key] || 0) + 1;
  }

  function execute(sql, values, mode) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('FROM sessions s JOIN users u')) {
      const user = state.users.find((item) => item.id === state.currentUserId);
      return user ? {
        ...user,
        role: 'user', status: 'active', must_change_password: 0,
        session_id: 'session-1', absolute_expires_at: '2099-01-01T00:00:00.000Z',
      } : null;
    }
    if (normalized.startsWith('UPDATE sessions SET last_active_at')) return changes(1);
    if (normalized.startsWith('DELETE FROM sessions')) return changes(0);

    if (normalized.includes('FROM user_data_revisions')) {
      return state.revisions[values[0]] || null;
    }

    if (normalized.startsWith('SELECT user_id FROM document_directory_states')) {
      return state.initializedUsers.has(values[0]) ? { user_id: values[0] } : null;
    }
    if (normalized.startsWith('INSERT INTO document_directory_states')) {
      if (state.initializedUsers.has(values[0])) throw new Error('UNIQUE constraint failed');
      state.initializedUsers.add(values[0]);
      return changes(1);
    }
    if (normalized.startsWith('INSERT INTO document_directories')) {
      const selectInsert = normalized.includes('COALESCE(MAX(sort_order)');
      const [id, user_id, name, name_key] = values;
      const sort_order = selectInsert
        ? Math.max(-1, ...state.directories.filter((item) => item.user_id === user_id).map((item) => item.sort_order ?? 0)) + 1
        : values[4];
      const created_at = values[selectInsert ? 4 : 5];
      const updated_at = values[selectInsert ? 5 : 6];
      if (state.directories.some((item) => item.user_id === user_id && item.name_key === name_key)) {
        throw new Error('UNIQUE constraint failed: document_directories.user_id, document_directories.name_key');
      }
      state.directories.push({ id, user_id, name, name_key, sort_order, created_at, updated_at });
      bumpRevision(user_id, 'directories_revision');
      return changes(1);
    }
    if (normalized.includes('FROM document_directories d') && normalized.includes('document_count')) {
      return sortedDirectories(state.directories.filter((item) => item.user_id === values[0])).map((directory) => ({
        ...directory,
        document_count: state.documents.filter((item) =>
          item.user_id === directory.user_id && item.directory_id === directory.id
        ).length,
      }));
    }
    if (normalized.startsWith('WITH ordered AS')) {
      const [userId, offset, id, updatedAt] = values;
      const ordered = sortedDirectories(state.directories.filter((item) => item.user_id === userId));
      const index = ordered.findIndex((item) => item.id === id);
      const adjacent = ordered[index + offset];
      if (index < 0 || !adjacent) return changes(0);
      const current = ordered[index];
      [current.sort_order, adjacent.sort_order] = [adjacent.sort_order, current.sort_order];
      current.updated_at = adjacent.updated_at = updatedAt;
      bumpRevision(userId, 'directories_revision');
      return changes(2);
    }
    if (normalized.startsWith('SELECT id FROM document_directories')) {
      const [id, userId] = values;
      const directory = state.directories.find((item) => item.id === id && item.user_id === userId);
      return directory ? { id: directory.id } : null;
    }
    if (normalized.startsWith('UPDATE document_directories SET sort_order')) {
      const [sortOrder, updatedAt, id, userId] = values;
      const directory = state.directories.find((item) => item.id === id && item.user_id === userId);
      if (!directory) return changes(0);
      Object.assign(directory, { sort_order: sortOrder, updated_at: updatedAt });
      return changes(1);
    }
    if (normalized.startsWith('UPDATE document_directories SET')) {
      const [name, nameKey, updatedAt, id, userId, force = 1, baseUpdatedAt = ''] = values;
      const directory = state.directories.find((item) => item.id === id && item.user_id === userId);
      if (!directory) return changes(0);
      if (!force && directory.updated_at !== baseUpdatedAt) return changes(0);
      if (state.directories.some((item) => item.user_id === userId && item.id !== id && item.name_key === nameKey)) {
        throw new Error('UNIQUE constraint failed: document_directories.user_id, document_directories.name_key');
      }
      Object.assign(directory, { name, name_key: nameKey, updated_at: updatedAt });
      bumpRevision(userId, 'directories_revision');
      return changes(1);
    }
    if (normalized.startsWith('DELETE FROM document_directories')) {
      const [id, userId] = values;
      const index = state.directories.findIndex((item) => item.id === id && item.user_id === userId);
      if (index < 0) return changes(0);
      if (normalized.includes('NOT EXISTS') && state.documents.some((item) => item.directory_id === id && item.user_id === userId)) {
        return changes(0);
      }
      state.directories.splice(index, 1);
      bumpRevision(userId, 'directories_revision');
      return changes(1);
    }
    if (normalized.startsWith('SELECT 1 FROM document_links')) {
      return state.documents.some((item) => item.directory_id === values[0] && item.user_id === values[1]) ? { 1: 1 } : null;
    }

    if (normalized.includes('FROM document_links') && normalized.includes('ORDER BY created_at DESC')) {
      return sortedDocuments(state.documents.filter((item) => item.user_id === values[0]));
    }
    if (normalized.startsWith('SELECT id, directory_id, title, description, created_at, updated_at FROM document_links')) {
      return state.documents.find((doc) => doc.id === values[0] && doc.user_id === values[1]) || null;
    }
    if (normalized.startsWith('INSERT INTO document_links')) {
      const [id, user_id, directory_id, title, description, created_at, updated_at] = values;
      state.documents.push({ id, user_id, directory_id, title, description, created_at, updated_at });
      bumpRevision(user_id, 'documents_revision');
      return changes(1);
    }
    if (normalized.startsWith('SELECT id FROM document_links')) {
      const item = state.documents.find((doc) => doc.id === values[0] && doc.user_id === values[1]);
      return item ? { id: item.id } : null;
    }
    if (normalized.startsWith('UPDATE document_links SET')) {
      const [directory_id, title, description, updated_at, id, user_id, force = 1, baseUpdatedAt = ''] = values;
      const item = state.documents.find((doc) => doc.id === id && doc.user_id === user_id);
      if (!item) return changes(0);
      if (!force && item.updated_at !== baseUpdatedAt) return changes(0);
      Object.assign(item, { directory_id, title, description, updated_at });
      bumpRevision(user_id, 'documents_revision');
      return changes(1);
    }
    if (normalized.startsWith('DELETE FROM document_links')) {
      const index = state.documents.findIndex((doc) => doc.id === values[0] && doc.user_id === values[1]);
      if (index < 0) return changes(0);
      state.documents.splice(index, 1);
      bumpRevision(values[1], 'documents_revision');
      return changes(1);
    }

    throw new Error(`Unhandled fake D1 query (${mode}): ${normalized}`);
  }

  function statement(sql) {
    let values = [];
    return {
      bind(...nextValues) { values = nextValues; return this; },
      first() { return Promise.resolve(execute(sql, values, 'first')); },
      all() { return Promise.resolve({ results: execute(sql, values, 'all') }); },
      run() { return Promise.resolve(execute(sql, values, 'run')); },
      _run() {
        const result = execute(sql, values, 'batch');
        if (/^SELECT\b/i.test(sql.trim()) || /^WITH\b/i.test(sql.trim()) && Array.isArray(result)) {
          return { results: Array.isArray(result) ? result : (result ? [result] : []) };
        }
        return result;
      },
    };
  }

  const db = {
    prepare: statement,
    async batch(statements) {
      const snapshot = structuredClone({
        todos: state.todos,
        directories: state.directories,
        documents: state.documents,
        initializedUsers: [...state.initializedUsers],
        revisions: state.revisions,
      });
      try {
        return statements.map((item) => item._run());
      } catch (exception) {
        state.todos = snapshot.todos;
        state.directories = snapshot.directories;
        state.documents = snapshot.documents;
        state.initializedUsers = new Set(snapshot.initializedUsers);
        state.revisions = snapshot.revisions;
        throw exception;
      }
    },
  };
  return { db, state };
}
