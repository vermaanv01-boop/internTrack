# InternTrack AI

InternTrack AI is a job-tracking application with an Express/MongoDB API and a React/Vite client, organized as a monorepo.

## Repository Layout

```text
.
├── server/          Express API, MongoDB models, authentication, and routes
├── client/          React/Vite frontend
├── docs/            Project documentation
├── README.md
└── .gitignore
```

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- MongoDB database or MongoDB Atlas connection string

## Environment Setup

Create the server environment file from the example:

```powershell
Copy-Item server/.env.example server/.env
```

Then set the values in `server/.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port; defaults to `5000` |
| `MONGO_URL` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign authentication tokens |
| `RESUME_UPLOAD_DIR` | No | Private resume storage directory; defaults to `server/storage/resumes` |

Create the client environment file from the example:

```powershell
Copy-Item client/.env.example client/.env
```

Then set the client API URL in `client/.env`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Yes | Backend API base URL, for example `https://api.example.com/api` or `/api` |
| `VITE_BASE_PATH` | No | Frontend deployment base path; defaults to `/` |
| `VITE_DEV_PROXY_TARGET` | No | Dev/preview proxy target used when `VITE_API_BASE_URL=/api` |

Only `VITE_`-prefixed variables are exposed to browser code. Do not place secrets, tokens, or credentials in client environment files. Do not commit `server/.env`, `client/.env`, or any other real environment file.

## Server

```powershell
cd server
npm install
npm run dev
```

Run the API in production mode:

```powershell
cd server
npm start
```

The default API URL is `http://localhost:5000`. The root endpoint returns a health message, and user routes are mounted at `/api/users`.

## Client

```powershell
cd client
Copy-Item .env.example .env
npm install
npm run dev
```

The API client reads `VITE_API_BASE_URL` from the build-time environment. Set it to an absolute API URL such as `https://api.example.com/api`, or use `/api` when the frontend and API share an origin. When `/api` is used, Vite dev and preview proxy requests to `VITE_DEV_PROXY_TARGET` (default `http://localhost:5000`).

Build and preview the production client:

```powershell
cd client
$env:VITE_API_BASE_URL = "https://api.example.com/api"
npm run build
npm run preview
```

Lint the client:

```powershell
cd client
npm run lint
```

## Frontend Deployment

The frontend is a single-page application using `BrowserRouter`. Production hosting must rewrite unknown non-file paths to `/index.html` so direct navigation and page refreshes work for routes such as `/dashboard` and `/applications`.

Example Nginx configuration:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Example Netlify `_redirects` entry:

```text
/* /index.html 200
```

When hosting under a subdirectory, set `VITE_BASE_PATH` for the build and configure the server rewrite under the same base path. Vite environment variables are embedded into the generated assets at build time; only public configuration belongs in them.

## API Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | API health message |
| `POST` | `/api/users/register` | Register a user |
| `POST` | `/api/users/login` | Log in and receive a token |
| `PUT` | `/api/users/update/:id` | Update a user; requires a bearer token |
| `POST` | `/api/users/logout` | Log out |
| `POST` | `/api/resumes` | Upload a PDF or DOCX resume (`multipart/form-data`, field `resume`) |
| `GET` | `/api/resumes` | List the authenticated user's resume versions |
| `GET` | `/api/resumes/:id` | Get resume metadata |
| `GET` | `/api/resumes/:id/download` | Download a stored resume |
| `PATCH` | `/api/resumes/:id/activate` | Set the active resume version |
| `DELETE` | `/api/resumes/:id` | Delete a resume and its stored file |

All resume routes require `Authorization: Bearer <token>`. Uploaded files are stored under the private `server/storage/` directory (git-ignored), never in `client/` or any static/public directory.

## Current Notes

- Run server tests with `npm test` from `server/`.
- Run frontend lint and production build with `npm run lint` and `npm run build` from `client/`.
- Install dependencies separately in `server/` and `client/`.
