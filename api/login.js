const crypto = require('crypto');

const LOGIN_SECRET = process.env.LOGIN_SECRET || 'xiaohu-todo-secret-2026';

const ACCOUNTS = [
  {
    username: 'hupenghui',
    passwordHash: '15dede3fbce896818be87fd3440d69f83601144367bcd64367e847feb2a52e40',
  },
];

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function generateToken(username) {
  const hmac = crypto.createHmac('sha256', LOGIN_SECRET).update(username).digest('hex');
  return username + ':' + hmac;
}

function verifyToken(token) {
  if (!token) return null;
  const idx = token.indexOf(':');
  if (idx === -1) return null;
  const username = token.substring(0, idx);
  const expected = generateToken(username);
  if (token === expected) return username;
  return null;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const account = ACCOUNTS.find((a) => a.username === username);
    if (!account) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const inputHash = sha256(password);
    if (inputHash !== account.passwordHash) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(username);
    return res.status(200).json({ token, username });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: '服务器错误' });
  }
};

module.exports.verifyToken = verifyToken;
