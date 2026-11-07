# Setup guide

The full guide is still in progress. The first working version will run a React frontend, a Node backend, and a few AWS resources for auth and data storage. To get a head start, get familiar with React, Node, Caddy, Vite, AWS Cognito, and AWS DynamoDB.

## Run the API locally

You need Node.js 20 or newer.

```sh
cd api
npm install
npm run dev
```

The API listens on http://localhost:3000 (set `PORT` to change it). Check that it's up:

```sh
curl http://localhost:3000/api/health
# {"status":"ok"}
```

| Command | What it does |
|---|---|
| `npm run dev` | Runs the server from source and restarts it when a file changes |
| `npm run build` | Compiles TypeScript from `src/` into `dist/` |
| `npm start` | Runs the compiled build in `dist/` (run `npm run build` first) |
| `npm run typecheck` | Type-checks without writing any files |
| `npm run lint` | Checks the code with ESLint |
| `npm run lint:fix` | Fixes the ESLint problems it can fix automatically |

## Run the UI locally

You need Node.js 20.19+, 22.13+, or 24+ (Vite and ESLint don't support the versions in between). Start the API first, then in a second terminal:

```sh
cd web
npm install
npm run dev
```

Open http://localhost:5173. The page calls `GET /api/health` and shows the result, so you'll see the API's `{"status":"ok"}` response when the API is running and an error when it isn't.

The dev server forwards every `/api` request to the API at http://localhost:3000, the same way Caddy does in production, so the UI uses the same `/api` paths in both. If the API runs somewhere else, set `API_URL` when you start the UI (for example `API_URL=http://localhost:4000 npm run dev`).

| Command | What it does |
|---|---|
| `npm run dev` | Runs the UI with hot reload and forwards `/api` to the API |
| `npm run build` | Type-checks and builds the static bundle into `dist/`, which Caddy serves in production |
| `npm run preview` | Serves the built bundle from `dist/` locally (run `npm run build` first) |
| `npm run typecheck` | Type-checks without building the bundle |
| `npm run lint` | Checks the code with ESLint |
| `npm run lint:fix` | Fixes the ESLint problems it can fix automatically |
