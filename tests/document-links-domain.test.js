import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INITIAL_DIRECTORY_NAMES,
  directoryNameKey,
  normalizeText,
  unicodeLength,
  validateDirectoryName,
  validateDocumentFields,
} from '../functions/_lib/document-links.js';

test('initial directories have the agreed stable order', () => {
  assert.deepEqual(INITIAL_DIRECTORY_NAMES, ['赠品管理', '产品文档', '销售政策']);
});

test('normalization trims and duplicate keys ignore case', () => {
  assert.equal(normalizeText('  Product A  '), 'Product A');
  assert.equal(directoryNameKey('  Product A  '), directoryNameKey('product a'));
});

test('Unicode code points count Chinese and emoji as one character', () => {
  assert.equal(unicodeLength('中文😀'), 3);
});

test('directory names enforce the 1-20 character contract', () => {
  assert.match(validateDirectoryName(''), /必填/);
  assert.equal(validateDirectoryName('产'.repeat(20)), '');
  assert.match(validateDirectoryName('产'.repeat(21)), /20/);
});

test('documents require valid title, description, and directory', () => {
  assert.deepEqual(validateDocumentFields({ directoryId: 'dir-1', title: '标题', description: 'https://a.test' }), {});
  assert.ok(validateDocumentFields({ directoryId: '', title: '', description: '' }).directoryId);
  assert.ok(validateDocumentFields({ directoryId: 'dir-1', title: '题'.repeat(21), description: 'x' }).title);
  assert.ok(validateDocumentFields({ directoryId: 'dir-1', title: 'x', description: '描'.repeat(101) }).description);
});
