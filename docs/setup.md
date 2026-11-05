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
