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

Do not commit `server/.env` or any other real environment file.

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
npm install
npm run dev
```

Build and preview the production client:

```powershell
cd client
npm run build
npm run preview
```

Lint the client:

```powershell
cd client
npm run lint
```

## API Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | API health message |
| `POST` | `/api/users/register` | Register a user |
| `POST` | `/api/users/login` | Log in and receive a token |
| `PUT` | `/api/users/update/:id` | Update a user; requires a bearer token |
| `POST` | `/api/users/logout` | Log out |

## Current Notes

- The frontend is currently the Vite starter UI and does not yet call the API.
- The server has no automated test suite configured; `npm test` currently exits with an error placeholder.
- Install dependencies separately in `server/` and `client/`.
