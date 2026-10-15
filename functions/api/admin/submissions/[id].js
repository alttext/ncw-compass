// DELETE /api/admin/submissions/:id — remove a suggestion after approve/deny.
// Protected by functions/_middleware.js (Cloudflare Access).

export async function onRequestDelete({ params, env }) {
  let id = String(params.id || '');
  try { id = decodeURIComponent(id); } catch {}
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  await env.SUBMISSIONS.delete(`sub:${id}`);
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
