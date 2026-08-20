import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../migrations/0005_silent_cross_device_sync.sql', import.meta.url),
  'utf8'
).catch(() => '');

function assertRevisionTriggers(sql) {
  for (const domain of ['todos', 'directories', 'documents']) {
    for (const operation of ['insert', 'update', 'delete']) {
      assert.match(sql, new RegExp(`bump_${domain}_revision_after_${operation}`, 'i'));
    }
  }
}

test('migration adds todo update tokens and revision storage', () => {
  assert.match(migration, /ALTER TABLE todos\s+ADD COLUMN updatedAt TEXT/i);
  assert.match(migration, /UPDATE todos\s+SET updatedAt = createdAt\s+WHERE updatedAt IS NULL/i);
  assert.match(migration, /CREATE TABLE user_data_revisions/i);
  assertRevisionTriggers(migration);
});

test('fresh schema includes update tokens and revision triggers', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS todos[\s\S]*updatedAt TEXT NOT NULL/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_data_revisions/i);
  assertRevisionTriggers(schema);
});
