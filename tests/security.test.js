import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PASSWORD_ITERATIONS,
  generateTemporaryPassword,
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
  verifyPassword,
} from '../functions/_lib/security.js';
import {
  clearSessionCookie,
  sessionCookie,
} from '../functions/_lib/auth.js';
import { requireSameOrigin } from '../functions/_lib/http.js';

test('PBKDF2 hashes and verifies passwords with the required work factor', async () => {
  const result = await hashPassword('a secure password');
  assert.equal(result.iterations, PASSWORD_ITERATIONS);
  assert.equal(result.salt.length, 32);
  assert.equal(result.hash.length, 64);
  assert.equal(
    await verifyPassword('a secure password', {
      password_hash: result.hash,
      password_salt: result.salt,
    }),
    true
  );
  assert.equal(
    await verifyPassword('wrong password', {
      password_hash: result.hash,
      password_salt: result.salt,
    }),
    false
  );
});

test('password verification honors the stored iteration count', async () => {
  const result = await hashPassword('iteration-aware-password', undefined, 1200);
  assert.equal(
    await verifyPassword('iteration-aware-password', {
      password_hash: result.hash,
      password_salt: result.salt,
      password_iterations: 1200,
    }),
    true
  );
});

test('username and password validation follows the public rules', () => {
  assert.equal(normalizeUsername('  Alice_01 '), 'alice_01');
  assert.equal(validateUsername('alice_01'), '');
  assert.notEqual(validateUsername('Alice!'), '');
  assert.equal(validatePassword('1234567890'), '');
  assert.notEqual(validatePassword('short'), '');
});

test('temporary passwords satisfy password policy', () => {
  const password = generateTemporaryPassword();
  assert.equal(validatePassword(password), '');
});

test('session cookies are HttpOnly, Secure, same-site, and clearable', () => {
  const cookie = sessionCookie('secret');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test('write origin must exactly match request origin', () => {
  const valid = new Request('https://todo.example/api/auth/login', {
    headers: { Origin: 'https://todo.example' },
  });
  const invalid = new Request('https://todo.example/api/auth/login', {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(requireSameOrigin(valid), true);
  assert.equal(requireSameOrigin(invalid), false);
});
