# InternTrack AI Client

React + Vite single-page application for InternTrack AI.

## Environment Variables

Create a local environment file from the example:

```powershell
Copy-Item .env.example .env
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Backend API base URL, for example `https://api.example.com/api` or `/api` |
| `VITE_BASE_PATH` | No | Deployment base path, defaults to `/`; use `/app/` for subdirectory hosting |
| `VITE_DEV_PROXY_TARGET` | No | Dev/preview proxy target used when `VITE_API_BASE_URL=/api`, defaults to `http://localhost:5000` |

Only variables prefixed with `VITE_` are exposed to browser code. Never put secrets, tokens, database credentials, or private keys in a client environment file.

### API URL format

Use either an absolute URL or a root-relative path:

```text
https://api.example.com/api
http://localhost:5000/api
/api
```

Trailing slashes are normalized. When `VITE_API_BASE_URL` is `/api`, the Vite dev and preview servers proxy `/api` requests to `VITE_DEV_PROXY_TARGET`.

## Development

```powershell
npm install
npm run dev
```

## Production Build

```powershell
$env:VITE_API_BASE_URL = "https://api.example.com/api"
npm run build
npm run preview
```

The production output is written to `dist/` and is ignored by Git. Verify that deployment injects the correct API URL at build time; Vite environment variables are embedded during the build.

## SPA Routing and Deployment

The app uses `BrowserRouter`, so production hosting must serve `index.html` for unknown non-file paths. This allows direct navigation and page refreshes on routes such as `/dashboard` and `/applications`.

Examples:

```text
# Netlify _redirects
/* /index.html 200
```

```nginx
# Nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

```apache
# Apache .htaccess
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

When hosting under a subdirectory, set `VITE_BASE_PATH` and configure the rewrite to that base path.

## Verification

```powershell
npm run lint
npm run build
```
