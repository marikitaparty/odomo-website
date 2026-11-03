# Odomo marketing site

Static pages for <https://odomo.marikita.party>, deployed to Cloudflare Pages.
No framework, no bundler: the HTML, CSS and JS in the repository root are the
site. `npm run build` (optional) copies them to `dist/` and can inject the
analytics config for another environment.

## Local preview

```sh
python3 -m http.server 8000    # or any static file server
```

Open <http://localhost:8000/>. The analytics origin allow-list includes
`localhost`, so tracking works locally against production OpenPanel.

## Analytics (MKP-287)

Cookieless, self-hosted OpenPanel: pageviews, referrers, UTM parameters and the
store-button clicks, with the campaign carried into the store links.

| File | Purpose |
| --- | --- |
| `assets/analytics-config.js` | The public client id and API base. Committed, no secrets. |
| `assets/analytics.js` | Loads the tracker only when a client id is set, captures the campaign, upgrades store links and tracks store clicks. |
| `assets/op1.js` | The `@openpanel/web` 1.4.3 script-tag tracker, vendored verbatim (MIT) so the site loads no third-party script. The session-replay build is not vendored. |

Every page includes both scripts, config first:

```html
<script src="assets/analytics-config.js" defer></script>
<script src="assets/analytics.js" defer></script>
```

### What is sent

- `screen_view` once per page load. The tracker adds `__path`, `__title` and
  `__referrer` (the referring site).
- `store_click` when an App Store or Google Play badge is clicked:
  `store` (`app_store` | `google_play`), the `utm_*` campaign parameters, and
  `destination` when the store URL is configured.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` from the
  landing URL are attached to every event, trimmed to 120 characters.

Request bodies go to `${apiUrl}/track` (`https://events.marikita.party/api/track`
in production).

### Configuration

Current values live in `assets/analytics-config.js`:

- client id `f4cbfaae-4523-4de8-8d54-8c67be905ce8` — public; browser traffic is
  authorised by the project's origin allow-list, not by a secret.
- API base `https://events.marikita.party/api`.

**Never** add a client secret here: the file ships to every visitor.

Emptying `clientId` disables tracking completely — no SDK is requested and no
event is sent (there is a test for this).

`npm run build` accepts optional environment variables and writes them into
`dist/assets/analytics-config.js`:

| Env var | Meaning |
| --- | --- |
| `ODOMO_OP_CLIENT_ID` | OpenPanel client id for the build. Leave it unset and the committed config is copied unchanged. |
| `ODOMO_OP_API_URL` | API base for that client. Defaults to `https://events.marikita.party/api`; use `https://events.stg-marikita.party/api` for staging. |

```sh
ODOMO_OP_CLIENT_ID=... ODOMO_OP_API_URL=https://events.stg-marikita.party/api npm run build
# → dist/
```

There are no runtime environment variables: the pages are static files.

Cloudflare Pages: if the project deploys the repository root, the committed
config is used and nothing else is needed. If it runs a build, use
`npm run build` with output directory `dist` and set the two variables above.

### Deploying

The `odomo-website` Pages project has **no Git integration**: merging to `main`
publishes nothing. Deploy from a clean `main` checkout after the checks pass:

```sh
git pull --ff-only
npm test && npm run build
npx wrangler pages deploy dist --project-name odomo-website --branch main
```

Verify the live pages by content, not status code: the custom domain redirects
`*.html` to the clean path (`/privacy-policy`, `/terms-of-service`) and the
redirect's own body is empty, so `curl -L` is required.

### Store links (pending listings)

Both badges are inert while the listings are pending: clicks are counted, and
nothing navigates. When a listing exists, put its URL in the badge's
`data-store-url` attribute in `index.html` and `index-website.html`:

- App Store: `https://apps.apple.com/app/id<APP_ID>`
- Google Play: `https://play.google.com/store/apps/details?id=com.useodomo.app`

`assets/analytics.js` then turns the badge into a link whose `href` carries the
`utm_*` values. For Google Play it also adds `referrer` with the same
parameters, because that is what Play forwards to the app as the Play Install
Referrer (MKP-288 reads the `utm_*` values from it). The App Store has no
equivalent for organic links.

### OpenPanel project setup

Applied on 2026-11-02 to the self-hosted instance:

- Project `odomo` → client `odomo-website`, type `write`, id
  `f4cbfaae-4523-4de8-8d54-8c67be905ce8`. It is separate from the app's native
  client and carries no secret in the browser.
- Project `odomo` → Settings → Details → **Allowed domains**:
  - `https://odomo.marikita.party`
  - `https://odomo-website.pages.dev`
  - `https://*.odomo-website.pages.dev` (preview deployments)
  - `https://localhost:*` (local preview)

OpenPanel 2 keeps the origin allow-list on the **project**, so a web client is
only usable together with the origins above. `www.` is matched by the
non-`www.` entry, and the scheme is ignored when matching. A browser sending an
origin outside the list gets `401 Ingestion: Invalid cors or secret`.

To repeat this in the dashboard: **Settings → Clients → Add client** (name,
type `Write (for ingestion)`), then **Settings → Details → Allowed domains**.
The client id is shown in the client list; the secret is shown once at creation
and is not needed for the website.

### Privacy stance

- **Cookieless.** No cookies, no `localStorage`, no `sessionStorage`, no
  fingerprinting. The tracker keeps the server-issued device id in memory for
  the page's lifetime only.
- **No session replay.** The replay build is not vendored, `sessionReplay` is
  explicitly disabled, and no replay script is ever requested.
- **No personal data.** Only campaign parameters, page path/title, referrer and
  which store badge was clicked. No accounts, emails, names or free text.
- **Best effort.** Analytics never blocks, delays or breaks navigation; if the
  tracker cannot load, the page behaves normally.

## Development

```sh
npm install     # jsdom, tests only
npm test
npm run lint    # syntax check of the site's JS and build script
npm run build
```
