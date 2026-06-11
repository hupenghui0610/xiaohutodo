const BLOCKED_PREFIXES = [
  '/backups/',
  '/functions/',
  '/migrate/',
  '/migrations/',
  '/scripts/',
  '/tests/',
];

const BLOCKED_PATHS = new Set([
  '/.assetsignore',
  '/.gitignore',
  '/package.json',
  '/package-lock.json',
  '/schema.sql',
  '/wrangler.toml',
]);

export async function onRequest({ request, env }) {
  const pathname = new URL(request.url).pathname;
  const blocked =
    BLOCKED_PATHS.has(pathname) ||
    BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (blocked) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return env.ASSETS.fetch(request);
}
