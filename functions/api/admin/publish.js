// POST /api/admin/publish — add / edit / delete a business row in index.html
// by committing to GitHub. Ported from netlify/functions/publish.js.
// Protected by functions/_middleware.js (Cloudflare Access).
//
// Required: GITHUB_TOKEN (secret), GITHUB_REPO (e.g. "alttext/ncw-compass").

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { action = 'add', snippet, tbody, businessName, oldName } = body;
  const token = env.GITHUB_TOKEN;
  const repo  = env.GITHUB_REPO;

  if (!token || !repo) {
    return json({ error: 'GITHUB_TOKEN and GITHUB_REPO must be set in Cloudflare Pages settings' }, 500);
  }

  const apiUrl = `https://api.github.com/repos/${repo}/contents/index.html`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ncw-compass-admin',
  };

  // Fetch current file
  let fileRes;
  try {
    fileRes = await fetch(apiUrl, { headers });
  } catch (e) {
    return json({ error: `Could not reach GitHub: ${e.message}` }, 502);
  }
  if (!fileRes.ok) {
    const e = await fileRes.json().catch(() => ({}));
    return json({ error: e.message || `GitHub ${fileRes.status}` }, fileRes.status);
  }
  const fileData = await fileRes.json();
  const currentHtml = base64ToUtf8(fileData.content);

  let updatedHtml;

  if (action === 'add') {
    const markerPos = currentHtml.indexOf(`id="${tbody}"`);
    if (markerPos === -1) return json({ error: `Could not find #${tbody}` }, 400);
    const closePos = currentHtml.indexOf('</tbody>', markerPos);
    updatedHtml = currentHtml.slice(0, closePos) + '        ' + snippet + '\n      ' + currentHtml.slice(closePos);

  } else if (action === 'delete') {
    updatedHtml = removeRow(currentHtml, businessName);
    if (updatedHtml === currentHtml) {
      return json({ error: `Could not find "${businessName}" in the list` }, 404);
    }

  } else if (action === 'edit') {
    const nameToRemove = oldName || businessName;
    const withoutOld = removeRow(currentHtml, nameToRemove);
    if (withoutOld === currentHtml) {
      return json({ error: `Could not find "${nameToRemove}" to update` }, 404);
    }
    const markerPos = withoutOld.indexOf(`id="${tbody}"`);
    if (markerPos === -1) return json({ error: `Could not find #${tbody}` }, 400);
    const closePos = withoutOld.indexOf('</tbody>', markerPos);
    updatedHtml = withoutOld.slice(0, closePos) + '        ' + snippet + '\n      ' + withoutOld.slice(closePos);

  } else {
    return json({ error: `Unknown action: ${action}` }, 400);
  }

  const commitMessage = action === 'delete'
    ? `Remove business: ${businessName}`
    : action === 'edit'
      ? `Update business: ${businessName}`
      : `Add approved business: ${businessName}`;

  let commitRes;
  try {
    commitRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: commitMessage,
        content: utf8ToBase64(updatedHtml),
        sha: fileData.sha,
      }),
    });
  } catch (e) {
    return json({ error: `Commit failed: ${e.message}` }, 502);
  }
  if (!commitRes.ok) {
    const e = await commitRes.json().catch(() => ({}));
    return json({ error: e.message || `Commit failed (${commitRes.status})` }, commitRes.status);
  }

  return json({ success: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function removeRow(html, businessName) {
  const escaped = businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `[ \\t]*<tr[^>]*>(?:(?!<\\/tr>)[\\s\\S])*?${escaped}(?:(?!<\\/tr>)[\\s\\S])*?<\\/tr>\\n?`,
    'i'
  );
  return html.replace(regex, '');
}
