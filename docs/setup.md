# Setup guide

The full guide is still in progress. The first working version will run a React frontend, a Node backend, and a few AWS resources for auth and data storage. To get a head start, get familiar with React, Node, Caddy, Vite, AWS Cognito, and AWS DynamoDB.

## Run the API locally

You need Node.js 20.19+, 22.13+, or 24+. The tools these projects use (ESLint, Jest and Vite) don't support the versions in between.

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
| `npm run build` | Compiles TypeScript from `src/` into `dist/`, leaving out test files |
| `npm start` | Runs the compiled build in `dist/` (run `npm run build` first) |
| `npm test` | Runs the tests with Jest |
| `npm run typecheck` | Type-checks without writing any files |
| `npm run lint` | Checks the code with ESLint |
| `npm run lint:fix` | Fixes the ESLint problems it can fix automatically |

## Run the UI locally

You need the same Node.js version as the API. Start the API first, then in a second terminal:

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
| `npm test` | Runs the tests with Jest |
| `npm run typecheck` | Type-checks without building the bundle |
| `npm run lint` | Checks the code with ESLint |
| `npm run lint:fix` | Fixes the ESLint problems it can fix automatically |

## Run the tests

Each project has its own tests, run with [Jest](https://jestjs.io/):

```sh
(cd api && npm test)
(cd web && npm test)
```

The tests don't need the API running, an AWS account, or network access. `npm test` exits with a non-zero code if any test fails.

Put a test next to the file it tests and name it `<file>.test.ts` (or `.test.tsx` in `web/`). To write a new one, copy an example:

- `api/src/routes/health.test.ts` calls a route over HTTP with [Supertest](https://github.com/ladjs/supertest). It uses `createApp()` from `api/src/app.ts`, so no server has to be started.
- `web/src/App.test.tsx` renders a component with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) and replaces `fetch` with a mock, so it never calls the API. The test environment (jsdom) has no `fetch` or `Response`, so mock every API call and build responses as plain objects, as this file does.

Import `describe`, `it`, `expect` and `jest` from `@jest/globals`, so TypeScript knows their types. Jest still sets them as globals too, and React Testing Library relies on that to clean up after each test, so don't turn the globals off. To run one file, or rerun tests when files change, pass Jest options after `--`, for example `npm test -- src/App.test.tsx` or `npm test -- --watch`.
