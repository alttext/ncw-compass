// Cloudflare Worker entry point for ncwcompass.com.
// Static files (index.html, travistool.html, favicon.svg) are served from assets.
// The Worker runs first only for /api/* and /travistool* (see wrangler.jsonc).
// The route handlers live in functions/ and keep the Pages Functions signature.

import { onRequest as accessGuard } from '../functions/_middleware.js';
import { onRequestPost as suggest } from '../functions/api/suggest.js';
import { onRequestPost as publish } from '../functions/api/admin/publish.js';
import { onRequestGet as listSubmissions } from '../functions/api/admin/submissions/index.js';
import { onRequestDelete as deleteSubmission } from '../functions/api/admin/submissions/[id].js';

const PASS = Symbol('pass');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const ctx = { request, env, params: {}, data: {}, next: async () => PASS };

    // Cloudflare Access check for /travistool and /api/admin/*
    const guard = await accessGuard(ctx);
    if (guard !== PASS) return guard;

    if (path === '/api/suggest') {
      return request.method === 'POST' ? suggest(ctx) : json({ error: 'Method not allowed' }, 405);
    }
    if (path === '/api/admin/publish') {
      return request.method === 'POST' ? publish(ctx) : json({ error: 'Method not allowed' }, 405);
    }
    if (path === '/api/admin/submissions' || path === '/api/admin/submissions/') {
      return request.method === 'GET' ? listSubmissions(ctx) : json({ error: 'Method not allowed' }, 405);
    }
    const m = path.match(/^\/api\/admin\/submissions\/([^/]+)$/);
    if (m) {
      if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
      ctx.params.id = m[1];
      return deleteSubmission(ctx);
    }
    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    // Everything else (including /travistool after the Access check) is a static asset.
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
