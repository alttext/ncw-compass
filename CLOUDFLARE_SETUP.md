# Moving NCW Compass from Netlify to Cloudflare Pages

## What changed in the code

| Netlify | Cloudflare |
|---|---|
| Netlify Forms (`data-netlify`) | `functions/api/suggest.js` stores each suggestion in Cloudflare KV (`SUBMISSIONS` binding), with a honeypot field for spam |
| Admin page pulled submissions from the Netlify API with a personal token saved in the browser | Admin page calls `/api/admin/submissions`, so no token is needed in the browser |
| `netlify/functions/publish.js` (**had no login**, so anyone could edit the live list) | `functions/api/admin/publish.js` does the same GitHub commit, now behind Cloudflare Access |
| `travistool.html` was public | `/travistool` and `/api/admin/*` require a Cloudflare Access login. `functions/_middleware.js` also checks the Access token, so `*.pages.dev` URLs stay protected too |

## Setup checklist

### 0. Before cutting over
- [ ] Use the **old** Netlify admin page to approve or deny any pending Netlify suggestions. They don't carry over.

### 1. Create the Pages project
- [ ] Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → `alttext/ncw-compass`
- [ ] Production branch: `main` · Framework preset: **None** · Build command: *(empty)* · Build output directory: `/`

### 2. Storage for suggestions (KV)
- [ ] **Storage & Databases → KV → Create namespace**, named `ncw-submissions`
- [ ] Pages project → **Settings → Bindings → Add → KV namespace**: variable name `SUBMISSIONS`, namespace `ncw-submissions`. Add it to both Production and Preview.

### 3. Lock down the admin with Cloudflare Access (free for up to 50 users)
- [ ] **Zero Trust** → set up a team name if prompted (free plan). Your team domain is `<team>.cloudflareaccess.com`.
- [ ] Settings → Authentication → make sure **One-time PIN** is enabled
- [ ] **Access → Applications → Add → Self-hosted**, named "NCW Compass Admin"
  - Destinations: `ncwcompass.com/travistool*`, `ncwcompass.com/api/admin`, `ncwcompass.pages.dev/travistool*`, `ncwcompass.pages.dev/api/admin`
    (add `*.ncwcompass.pages.dev` versions too if you want admin access on preview deploys)
  - Policy: **Allow** → Include → Emails → your admin email address(es)
- [ ] Copy the application's **Audience (AUD) tag**

### 4. Environment variables (Pages → Settings → Variables and Secrets)
| Name | Type | Value |
|---|---|---|
| `GITHUB_REPO` | Text | `alttext/ncw-compass` |
| `GITHUB_TOKEN` | **Secret** | Fine-grained GitHub token: only this repo, **Contents: Read and write** |
| `ACCESS_TEAM_DOMAIN` | Text | `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | Text | the AUD tag from step 3 |

- [ ] Then **Deployments → Retry deployment** so the functions pick up the bindings.

### 5. Test on `ncwcompass.pages.dev`
- [ ] Submit a test suggestion from the homepage
- [ ] Open `/travistool`. You should get the Access login, then see the test suggestion.
- [ ] Approve it. It should commit to GitHub and appear after the next deploy (~30s). Then delete it from "Manage Existing Businesses".
- [ ] In a private window, `/api/admin/submissions` should return 403.

### 6. Point the domain at Cloudflare
- [ ] Add `ncwcompass.com` to Cloudflare (change nameservers at the registrar) if it isn't there already
- [ ] Pages project → **Custom domains** → add `ncwcompass.com` (and `www.ncwcompass.com`)
- [ ] Wait for SSL to go active, then re-run the step 5 checks on the real domain

### 7. Shut down Netlify
- [ ] Netlify → Project configuration → Danger zone → delete the project (or at least stop builds and remove `GITHUB_TOKEN` from its env vars)
- [ ] Revoke the Netlify personal access token used by the old admin page
- [ ] Clear `ncw_nl_token` / `ncw_site_id` from browser storage on the admin page (or just clear the site data)

## Optional next step
- Add **Cloudflare Turnstile** to the suggest form if spam gets past the honeypot.
