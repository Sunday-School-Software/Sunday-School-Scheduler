# Setup guide

This guide takes you from a fresh clone to the app running on your machine. The app is a React UI built with Vite and a Node API. In production, Caddy serves the UI and forwards `/api` requests to the API, and the API uses Amazon Cognito for sign-in and Amazon DynamoDB for data.

## Sections

1. [Before you start](#before-you-start)
2. [Get the code](#get-the-code)
3. [Run the API locally](#run-the-api-locally)
4. [Run the UI locally](#run-the-ui-locally)
5. [Run the tests](#run-the-tests)
6. [Create the DynamoDB table](#create-the-dynamodb-table), in DynamoDB Local or in AWS
7. Set up the rest of AWS (not written yet):
   - Create the Cognito user pool and app client, and where the IDs go ([#32](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/32))
   - Load the seed data, and which account to sign in with ([#34](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/34))
8. Deploy (not written yet): ship the app to the server and read the API's logs ([#44](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/44))

## Before you start

You need:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 20.19+, 22.13+, or 24+, which comes with npm. Run `node --version` to check. Versions 21 and 23 are not supported.

The sections written so far don't need an AWS account. To run the database on your machine instead of in AWS, you also need [Docker](https://docs.docker.com/get-started/get-docker/).

## Get the code

```sh
git clone https://github.com/Sunday-School-Software/Sunday-School-Scheduler.git
cd Sunday-School-Scheduler
```

If you plan to open a pull request, [fork the repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) first and clone your fork instead (see [the pull request process](../CONTRIBUTING.md#the-pull-request-process)).

The commands in each section below start from this folder, the root of the repository.

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
| `npm run db:create` | Creates the DynamoDB table (see [Create the DynamoDB table](#create-the-dynamodb-table)) |

## Run the UI locally

You need the same Node.js version as the API. Start the API first and leave it running. Then open a second terminal in the root of the repository and run:

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

## Create the DynamoDB table

The app keeps all its data in one DynamoDB table, described in [the data model](data-model.md). `npm run db:create` creates it, with its keys and indexes. It reads two environment variables:

| Variable | What it's for |
|---|---|
| `DYNAMODB_TABLE` | The table's name. Required, with no default, so development and production always use separate tables. |
| `DYNAMODB_ENDPOINT` | Where DynamoDB is. Set it to use DynamoDB Local; leave it unset to use AWS. |

Running the command again is safe. If the table already exists with the right keys and indexes, it says so and changes nothing, and the data in it is kept. If a table with that name exists but its keys or indexes are different, the command lists the differences, exits with an error and leaves the table alone.

### In DynamoDB Local

[DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) runs DynamoDB on your machine, so you don't need an AWS account. Start it in Docker and leave it running:

```sh
docker run --rm -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory -sharedDb
```

`-inMemory` keeps the data only until you stop the container, so you start fresh each time. `-sharedDb` keeps one database no matter which region and credentials connect to it.

Then, in another terminal, create the table:

```sh
cd api
DYNAMODB_ENDPOINT=http://localhost:8000 DYNAMODB_TABLE=sunday-school-dev npm run db:create
# Created table sunday-school-dev.
```

With `DYNAMODB_ENDPOINT` set, you don't need AWS credentials or a region. The command uses placeholders, since DynamoDB Local accepts any. If it says it couldn't connect, check that the container is running and the port matches.

### In AWS

You need AWS credentials allowed to call `dynamodb:DescribeTable` and `dynamodb:CreateTable`, and a region, set the usual way for the AWS SDK (for example with `aws configure` or `aws login`, or `AWS_PROFILE` and `AWS_REGION`). Then:

```sh
cd api
DYNAMODB_TABLE=sunday-school-dev npm run db:create
```

Use a name that says which environment the table is for, such as `sunday-school-dev` for development and `sunday-school-prod` for production. The table uses on-demand billing, so an idle development table costs nothing (see [Billing](data-model.md#billing)).
