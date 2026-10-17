# DKY Study Hub — GitHub Pages + Cloudflare Worker

This version keeps the website static on GitHub Pages and moves YouTube API calls to a Cloudflare Worker. Students never enter an API key.

## Files
- `index.html` — updated frontend (no browser-side API key storage or prompt)
- `worker/index.js` — server-side YouTube search endpoint
- `worker/wrangler.toml` — optional Wrangler configuration

## 1. Protect your API key first
The API key shared in chat should be treated as exposed. In Google Cloud Console → APIs & Services → Credentials, rotate/delete that key and create a new one. Enable **YouTube Data API v3** and restrict the new key to that API. Do not put the new key in `index.html`, GitHub, or this ZIP.

## 2. Deploy the Worker in Cloudflare
1. Sign in at https://dash.cloudflare.com/ and open **Workers & Pages**.
2. Create a Worker (for example `dky-study-hub-api`).
3. Open its code editor and replace the starter code with `worker/index.js`; deploy it.
4. In the Worker settings, add a **Text variable** named `ALLOWED_ORIGIN`. Set it to the exact origin of your GitHub Pages site, e.g. `https://YOUR-USERNAME.github.io` (no path and no trailing slash). If you use a custom domain, use that origin instead.
5. In Worker settings → Variables and Secrets, add a **Secret** named `YOUTUBE_API_KEY` with your newly rotated API key. Save/deploy the changes.
6. Your Worker URL will look like `https://dky-study-hub-api.YOUR-SUBDOMAIN.workers.dev`.

## 3. Connect GitHub Pages frontend
1. Open `index.html` in this project.
2. Find `const API_BASE_URL="https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev";` near the start of the script.
3. Replace only the example URL with your real Worker URL. Do not add the API key there.
4. Commit and push the updated `index.html` to the GitHub repository that publishes your site. GitHub Pages will publish the change.

## 4. Verify it
- Open your published website, open a chapter, then choose Lecture or Question Practice.
- Results should load without any key input panel.
- If you see “site owner needs to finish setup”, check `API_BASE_URL`.
- If you see “origin is not allowed”, make `ALLOWED_ORIGIN` exactly match the site's origin shown in the browser address bar (scheme + hostname, no path).
- If search fails, check the Worker logs, secret name, YouTube Data API enablement, key restrictions, and Google Cloud quota.

## Security and quota notes
- The API key is stored as a Cloudflare Worker secret and is not sent to the browser.
- The Worker accepts only known subjects/chapters and the two allowed search modes; it does not accept an arbitrary YouTube query from the browser.
- Successful results are cached for 30 minutes to reduce repeated API usage. YouTube `search.list` uses 100 quota units per call, so configure quota alerts and consider Cloudflare rate-limiting/WAF rules before public promotion. Caching and CORS alone do **not** prevent automated abuse; CORS is not authentication.
- For stronger protection, add a Cloudflare rate-limiting rule for `/api/videos` and monitor usage. Do not publish or commit the secret.
- GitHub Pages remains the static host; the Worker is the separate backend. Chapter progress continues to be saved locally in each student's browser.

## Local preview
You can preview the static frontend, but video search requires the deployed Worker and the correct `API_BASE_URL`.

```bash
python -m http.server 8000
```
Then open `http://localhost:8000`. The Worker intentionally allows only the exact configured site origin, so local preview requests will be rejected unless you temporarily configure a separate development Worker/origin. Do not weaken production settings for convenience.
