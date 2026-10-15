// Protects the admin page and admin API with Cloudflare Access.
// Cloudflare Access blocks unauthenticated visitors at the edge on ncwcompass.com;
// this middleware also verifies the Access JWT so the same paths stay locked on
// *.pages.dev preview URLs or if the Access policy is ever misconfigured.
//
// Required environment variables (Pages → Settings → Variables and Secrets):
//   ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
//   ACCESS_AUD          the Application Audience (AUD) tag of the Access application

const PROTECTED = [/^\/travistool(\.html)?\/?$/i, /^\/api\/admin(\/|$)/i];

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);
  if (!PROTECTED.some((re) => re.test(pathname))) return next();

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') || getCookie(request, 'CF_Authorization');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return forbidden(pathname);
  }
  try {
    const claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    context.data.adminEmail = claims.email || '';
  } catch (e) {
    return forbidden(pathname);
  }
  return next();
}

function forbidden(pathname) {
  const body = pathname.startsWith('/api/')
    ? JSON.stringify({ error: 'Not authorized' })
    : 'Not authorized';
  return new Response(body, {
    status: 403,
    headers: { 'Content-Type': pathname.startsWith('/api/') ? 'application/json' : 'text/plain' },
  });
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

let certCache = { at: 0, keys: [] };

async function getKeys(teamDomain) {
  if (Date.now() - certCache.at < 10 * 60 * 1000 && certCache.keys.length) return certCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('certs fetch failed');
  const { keys } = await res.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function verifyAccessJwt(token, teamDomain, aud) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [h, p, sig] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  if (header.alg !== 'RS256') throw new Error('alg');

  const jwk = (await getKeys(teamDomain)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown kid');
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) throw new Error('bad signature');

  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new Error('aud');
  if (payload.iss !== `https://${teamDomain}`) throw new Error('iss');
  if (!payload.exp || payload.exp < now) throw new Error('expired');
  return payload;
}
