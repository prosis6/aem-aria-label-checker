# AEM Aria Label Checker

Small Node.js tool for checking AEM Card Deck components and verifying whether `aria-label` values match the expected content rules.

## What this repository does

This project helps QA and developers review AEM pages that include `marsh-aemrefresh/components/carddeck` components and detect common issues like:

- `Get aria-label from title` enabled while the field is empty or inconsistent
- `ariaLabel` text duplicated or conflicting with `cardDeckTitle`
- pages not live or redirecting
- Card Deck components missing or authored unexpectedly

The app can be used from a browser UI and also exposes a simple API.

## Repository structure

- `server.js` — Express web server and API endpoints
- `check-card-deck.js` — AEM page parsing and validation logic
- `public/` — frontend UI files (`index.html`, `app.js`, `styles.css`)
- `package.json` — project scripts and dependencies

## Requirements

- Node.js 18 or newer
- npm

## Install dependencies

```bash
npm install
```

## Start the local server

From the repository root:

```bash
npm start
```

or:

```bash
npm run serve
```

Then open:

```text
http://localhost:3000
```

If you need a custom port:

```bash
PORT=4000 npm start
```

## Basic usage

### Web UI

1. Open the local app in the browser.
2. Paste one or more AEM page paths (one per line).
3. Set the base host if needed.
4. Click "Check" to scan the pages.

### API

The server exposes:

- `GET /api/meta` — returns metadata and supported rules
- `POST /api/check` — checks provided page paths

Example request body:

```json
{
  "host": "https://www.test-site.com",
  "paths": [
    "/content/test-site/asia/jp/ja_jp/services/captive-insurance"
  ]
}
```

## CLI usage

You can also run the checker directly from the command line:

```bash
node check-card-deck.js /content/test-site/asia/jp/ja_jp/services/captive-insurance --host https://www.test-site.com
```

Additional flags are defined in the script header and support JSON export or report file generation.

## Notes

- The tool expects AEM pages exposed as `.infinity.json` responses.
- It is designed for internal quality checks and page audits, not as a general-purpose AEM editor.
