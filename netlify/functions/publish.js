exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { action = 'add', snippet, tbody, businessName, oldName } = body;
  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GITHUB_TOKEN and GITHUB_REPO must be set as Netlify environment variables' })
    };
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
    return { statusCode: 502, body: JSON.stringify({ error: `Could not reach GitHub: ${e.message}` }) };
  }
  if (!fileRes.ok) {
    const e = await fileRes.json().catch(() => ({}));
    return { statusCode: fileRes.status, body: JSON.stringify({ error: e.message || `GitHub ${fileRes.status}` }) };
  }
  const fileData = await fileRes.json();
  const currentHtml = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

  let updatedHtml;

  if (action === 'add') {
    const markerPos = currentHtml.indexOf(`id="${tbody}"`);
    if (markerPos === -1) return { statusCode: 400, body: JSON.stringify({ error: `Could not find #${tbody}` }) };
    const closePos = currentHtml.indexOf('</tbody>', markerPos);
    updatedHtml = currentHtml.slice(0, closePos) + '        ' + snippet + '\n      ' + currentHtml.slice(closePos);

  } else if (action === 'delete') {
    updatedHtml = removeRow(currentHtml, businessName);
    if (updatedHtml === currentHtml) {
      return { statusCode: 404, body: JSON.stringify({ error: `Could not find "${businessName}" in the list` }) };
    }

  } else if (action === 'edit') {
    const nameToRemove = oldName || businessName;
    const withoutOld = removeRow(currentHtml, nameToRemove);
    if (withoutOld === currentHtml) {
      return { statusCode: 404, body: JSON.stringify({ error: `Could not find "${nameToRemove}" to update` }) };
    }
    const markerPos = withoutOld.indexOf(`id="${tbody}"`);
    if (markerPos === -1) return { statusCode: 400, body: JSON.stringify({ error: `Could not find #${tbody}` }) };
    const closePos = withoutOld.indexOf('</tbody>', markerPos);
    updatedHtml = withoutOld.slice(0, closePos) + '        ' + snippet + '\n      ' + withoutOld.slice(closePos);

  } else {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
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
        content: Buffer.from(updatedHtml).toString('base64'),
        sha: fileData.sha,
      }),
    });
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: `Commit failed: ${e.message}` }) };
  }
  if (!commitRes.ok) {
    const e = await commitRes.json().catch(() => ({}));
    return { statusCode: commitRes.status, body: JSON.stringify({ error: e.message || `Commit failed (${commitRes.status})` }) };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

function removeRow(html, businessName) {
  const escaped = businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `[ \\t]*<tr[^>]*>(?:(?!<\\/tr>)[\\s\\S])*?${escaped}(?:(?!<\\/tr>)[\\s\\S])*?<\\/tr>\\n?`,
    'i'
  );
  return html.replace(regex, '');
}
