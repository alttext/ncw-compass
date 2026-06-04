exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let snippet, tbody, businessName;
  try {
    ({ snippet, tbody, businessName } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  const repo  = process.env.GITHUB_REPO; // e.g. "benedwards/ncw-compass"

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

  // 1. Fetch current file from GitHub
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

  // 2. Decode, inject new row, re-encode
  const currentHtml = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf8');

  const markerPos = currentHtml.indexOf(`id="${tbody}"`);
  if (markerPos === -1) {
    return { statusCode: 400, body: JSON.stringify({ error: `Could not find #${tbody} in index.html` }) };
  }
  const closePos = currentHtml.indexOf('</tbody>', markerPos);
  const updatedHtml = currentHtml.slice(0, closePos) +
    '        ' + snippet + '\n      ' +
    currentHtml.slice(closePos);

  // 3. Commit back to GitHub
  let commitRes;
  try {
    commitRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Add approved business: ${businessName}`,
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
