// Public endpoint for the "Suggest a Business" form.
// Replaces Netlify Forms: stores each submission in the SUBMISSIONS KV namespace.

const FIELDS = {
  type: 20,
  'business-name': 200,
  'business-url': 500,
  why: 2000,
  category: 100,
};

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid form data' }, 400);
  }

  // Honeypot: bots fill every field. Pretend success so they don't retry.
  if ((form.get('company-website') || '').toString().trim()) return json({ success: true });

  const data = {};
  for (const [name, max] of Object.entries(FIELDS)) {
    data[name] = (form.get(name) || '').toString().trim().slice(0, max);
  }

  if (!['support', 'avoid'].includes(data.type)) return json({ error: 'Choose support or avoid' }, 400);
  if (!data['business-name']) return json({ error: 'Business name is required' }, 400);
  if (!data.why) return json({ error: 'Please say why' }, 400);
  if (data['business-url'] && !/^https?:\/\//i.test(data['business-url'])) data['business-url'] = '';

  const created_at = new Date().toISOString();
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const record = { id, created_at, form_name: 'suggest', data };

  await env.SUBMISSIONS.put(`sub:${id}`, JSON.stringify(record));
  return json({ success: true });
}

export function onRequest() {
  return json({ error: 'Method not allowed' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
