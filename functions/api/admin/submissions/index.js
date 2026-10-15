// GET /api/admin/submissions — list pending suggestions (newest first).
// Protected by functions/_middleware.js (Cloudflare Access).

export async function onRequestGet({ env }) {
  const records = [];
  let cursor;
  do {
    const page = await env.SUBMISSIONS.list({ prefix: 'sub:', cursor });
    const values = await Promise.all(page.keys.map((k) => env.SUBMISSIONS.get(k.name, 'json')));
    records.push(...values.filter(Boolean));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return new Response(JSON.stringify(records), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
