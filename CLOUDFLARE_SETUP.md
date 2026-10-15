# Moving NCW Compass from Netlify to Cloudflare Workers

The site runs as a **Cloudflare Worker with static assets** (Worker name `ncw-compass`, built from this repo).

## How it fits together

| Piece | What it does |
|---|---|
| `wrangler.jsonc` | Worker config: serves the repo root as static assets, runs the Worker first only for `/api/*` and `/travistool*`, binds KV `SUBMISSIONS` |
| `.assetsignore` | Keeps `.git`, `worker/`, `functions/`, config and docs from being published as files |
| `worker/index.js` | Router: Access check, then the API handlers, then static assets |
| `functions/api/suggest.js` | Public form endpoint. Saves each suggestion to KV, with a honeypot spam check |
| `functions/api/admin/*` | List and delete suggestions; publish to GitHub (replaces the old Netlify function) |
| `functions/_middleware.js` | Verifies the Cloudflare Access login for `/travistool` and `/api/admin/*`. With no valid login those paths return **403**, so they fail closed. |

## Setup checklist

### 1. Worker + builds (done)
- [x] Worker `ncw-compass` connected to `alttext/ncw-compass`, production branch `main`, deploy command `npx wrangler deploy`

### 2. KV (done)
- [x] Namespace `ncw-submissions` created. Its ID is already in `wrangler.jsonc`.

### 3. Before merging
- [ ] Netlify → Project configuration → Build & deploy → **Stop builds**. That way the Netlify-hosted site keeps the old working form until DNS moves.

### 4. Merge this PR
Cloudflare redeploys. The public site and form work immediately. The admin returns 403 until steps 5–6 are done.

### 5. Variables and secrets (Worker → Settings → Variables and Secrets)
| Name | Type | Value |
|---|---|---|
| `GITHUB_TOKEN` | **Secret** | A **new** fine-grained GitHub token: only `alttext/ncw-compass`, **Contents: Read and write**. The old Netlify one returns "Bad credentials". |
| `ACCESS_TEAM_DOMAIN` | Text | `<team>.cloudflareaccess.com` (Zero Trust → Settings → Team name) |
| `ACCESS_AUD` | Text | AUD tag(s) from step 6, comma-separated |

(`GITHUB_REPO` is already set in `wrangler.jsonc`.)

### 6. Cloudflare Access
- [ ] Zero Trust → Settings → Authentication: make sure **One-time PIN** is on
- [ ] **For the real domain:** Zero Trust → Access → Applications → Add → **Self-hosted**, named "NCW Compass Admin"
  - Destinations: `ncwcompass.com/travistool*` and `ncwcompass.com/api/admin`
  - Policy: Allow → Emails → your admin email(s)
  - Copy its **AUD tag** into `ACCESS_AUD`
- [ ] **Optional, for workers.dev / preview URLs:** Worker → **Access** tab → enable. Add that app's AUD to `ACCESS_AUD` too, separated by a comma.

### 7. Test on `ncw-compass.winter-cake-9886.workers.dev`
- [ ] Submit a test suggestion
- [ ] `/travistool` → sign in → the test suggestion shows → Approve → a commit lands in GitHub and the site redeploys (~30–60s) → delete it under "Manage Existing Businesses"
- [ ] In a private window, `/api/admin/submissions` returns 403 and `/.git/config` returns 404

### 8. Move the domain (Namecheap → Cloudflare)
- [ ] Cloudflare → Add a domain → `ncwcompass.com` (Free plan). Check that the imported DNS records look right.
- [ ] Namecheap → Domain → **Nameservers → Custom DNS** → enter the two Cloudflare nameservers
- [ ] Once the zone is active: Worker → Settings → **Domains & Routes → Add → Custom domain** → `ncwcompass.com` (and `www.ncwcompass.com`)
- [ ] Re-run the step 7 checks on the real domain

### 9. Shut down Netlify
- [ ] Delete the Netlify project (or at least remove `GITHUB_TOKEN` from its env vars)
- [ ] Revoke the old GitHub token and the Netlify personal access token used by the old admin page
