const encoder = new TextEncoder();

export const PASSWORD_ITERATIONS = 210000;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashPassword(password, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256
  );
  return {
    hash: bytesToHex(new Uint8Array(bits)),
    salt: saltHex,
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password, user) {
  if (user.password_hash && user.password_salt) {
    const result = await hashPassword(password, user.password_salt);
    return result.hash === user.password_hash;
  }
  if (user.legacy_password_hash) {
    return (await sha256(password)) === user.legacy_password_hash;
  }
  return false;
}

export function validatePassword(password) {
  if (typeof password !== 'string') return '请输入密码';
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `密码长度须为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 个字符`;
  }
  return '';
}

export function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

export function validateUsername(username) {
  return /^[a-z0-9_]{3,32}$/.test(username)
    ? ''
    : '用户名须为 3-32 位小写字母、数字或下划线';
}

export function generateTemporaryPassword() {
  return `Xh_${randomHex(10)}`;
}
