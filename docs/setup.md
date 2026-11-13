# Setup guide

This guide takes you from a fresh clone to the app running on your machine. The app is a React UI built with Vite and a Node API. In production, Caddy serves the UI and forwards `/api` requests to the API, and the API uses Amazon Cognito for sign-in and Amazon DynamoDB for data.

## Sections

1. [Before you start](#before-you-start)
2. [Get the code](#get-the-code)
3. [Run the API locally](#run-the-api-locally)
4. [Run the UI locally](#run-the-ui-locally)
5. [Run the tests](#run-the-tests)
6. [Continuous integration](#continuous-integration), what runs on every push and pull request
7. [Create the DynamoDB table](#create-the-dynamodb-table), in DynamoDB Local or in AWS
8. [Create the Cognito user pool](#create-the-cognito-user-pool), in cognito-local or in AWS, and where the IDs go
9. [Load the seed data](#load-the-seed-data), and which account to sign in with
10. Deploy (not written yet): ship the app to the server and read the API's logs ([#44](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/44))
11. [When things go wrong](#when-things-go-wrong)

## Before you start

You need:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) 20.19+, 22.13+, or 24+, which comes with npm. Run `node --version` to check. Versions 21 and 23 are not supported.
- [curl](https://curl.se/download.html), used below to check that the API is running. It comes preinstalled on macOS and most Linux distributions, and with Windows 10 and later.

The sections written so far don't need an AWS account. To run the database and sign-in on your machine instead of in AWS, you also need [Docker](https://docs.docker.com/get-started/get-docker/).

## Get the code

1. Clone the repository and move into it:

   ```sh
   git clone https://github.com/Sunday-School-Software/Sunday-School-Scheduler.git
   cd Sunday-School-Scheduler
   ```

   If you plan to open a pull request, [fork the repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) first and clone your fork instead (see [the pull request process](../CONTRIBUTING.md#the-pull-request-process)).

The commands in each section below start from this folder, the root of the repository.

## Run the API locally

You need Node.js 20.19+, 22.13+, or 24+. The tools these projects use (ESLint, Jest and Vite) don't support the versions in between.

1. Move into the API folder and install its dependencies:

   ```sh
   cd api
   npm install
   ```

2. Start the API:

   ```sh
   npm run dev
   ```

   The API listens on http://localhost:3000 (set `PORT` to change it). Leave it running while you work through the rest of this guide.

3. Check that it's up:

   ```sh
   curl http://localhost:3000/api/health
   # {"status":"ok"}
   ```

   **Checkpoint:** the command prints `{"status":"ok"}`. If curl reports that it could not connect, the API is not running yet — give `npm run dev` a moment, and see [When things go wrong](#when-things-go-wrong) if it keeps failing.

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
| `npm run cognito:create` | Creates the Cognito user pool and app client (see [Create the Cognito user pool](#create-the-cognito-user-pool)) |
| `npm run seed` | Loads made-up teachers, classes and assignments, and their accounts (see [Load the seed data](#load-the-seed-data)) |

The API and these commands read their settings from environment variables. To avoid typing them each time, copy `api/.env.example` to `api/.env` and fill it in (see [Where the IDs go](#where-the-ids-go)). A variable set in your shell overrides the file. Git ignores `.env`, so your settings stay out of commits.

## Run the UI locally

You need the same Node.js version as the API.

1. Start the API first (see the previous section) and leave it running.

2. Open a second terminal in the root of the repository, move into the UI folder and install its dependencies:

   ```sh
   cd web
   npm install
   ```

3. Start the UI:

   ```sh
   npm run dev
   ```

4. Open http://localhost:5173. The page calls `GET /api/health` and shows the result, so you'll see the API's `{"status":"ok"}` response when the API is running and an error when it isn't.

   **Checkpoint:** the page shows `{"status":"ok"}`. If it shows an error instead, the API is not reachable — check it is still running in its terminal (step 1), and see [When things go wrong](#when-things-go-wrong).

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

1. Run the API tests and the UI tests, one line each:

   ```sh
   (cd api && npm test)
   (cd web && npm test)
   ```

The tests don't need the API running, an AWS account, or network access. `npm test` exits with a non-zero code if any test fails.

**Checkpoint:** both suites report that every test passed. A failure on a fresh clone, before you have changed anything, is worth reporting — see [When things go wrong](#when-things-go-wrong).

Put a test next to the file it tests and name it `<file>.test.ts` (or `.test.tsx` in `web/`). To write a new one, copy an example:

- `api/src/routes/health.test.ts` calls a route over HTTP with [Supertest](https://github.com/ladjs/supertest). It uses `createApp()` from `api/src/app.ts`, so no server has to be started.
- `web/src/App.test.tsx` renders a component with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) and replaces `fetch` with a mock, so it never calls the API. The test environment (jsdom) has no `fetch` or `Response`, so mock every API call and build responses as plain objects, as this file does.

Import `describe`, `it`, `expect` and `jest` from `@jest/globals`, so TypeScript knows their types. Jest still sets them as globals too, and React Testing Library relies on that to clean up after each test, so don't turn the globals off. To run one file, or rerun tests when files change, pass Jest options after `--`, for example `npm test -- src/App.test.tsx` or `npm test -- --watch`.

CI runs these tests for you on every push and pull request (see [Continuous integration](#continuous-integration)).

## Continuous integration

GitHub Actions runs the checks for you on every push to any branch and on every pull request to `main`, including pull requests from forks. Each project has its own workflow:

| Workflow | File | Runs when a change touches |
|---|---|---|
| API CI | `.github/workflows/api.yml` | `api/`, or the workflow file itself |
| Web CI | `.github/workflows/web.yml` | `web/`, or the workflow file itself |

Each workflow uses Node.js 22 and runs these commands, in order, from inside the project's folder: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. The first command that fails stops the run and fails the check. npm downloads are cached using the project's `package-lock.json`.

A change that touches nothing in a project doesn't run that project's checks, so a change to only `docs/` runs neither. On a pull request, the Checks tab shows which workflow ran and which step failed.

The checks need no AWS account, network access or secrets, for the same reason the tests don't (see [Run the tests](#run-the-tests)).

To reproduce a CI run on your machine, run the same commands from the project's folder:

```sh
cd api   # or: cd web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm ci` installs exactly what `package-lock.json` says, and fails if `package.json` and the lockfile disagree. Use it instead of `npm install` when you want the same result as CI.

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

## Create the Cognito user pool

The app signs people in with an [Amazon Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html) user pool (see [the design](design.md#decision-use-amazon-cognito-for-sign-in)). `npm run cognito:create` creates the pool and the API's app client:

- The pool signs people in with their email address, in any letter case, and sends a code to the email to verify it when they sign up. It has deletion protection on, so it can't be deleted by accident.
- The app client, `sunday-school-api`, has no client secret and allows `USER_PASSWORD_AUTH`, because the API sends the email and password to Cognito for `login()`.

The command reads these environment variables:

| Variable | What it's for |
|---|---|
| `COGNITO_USER_POOL_NAME` | The pool's name. Required, with no default, so development and production always use separate pools. |
| `COGNITO_ENDPOINT` | Where Cognito is. Set it to use cognito-local; leave it unset to use AWS. |

Running the command again is safe. It finds the pool by name, and if the pool and app client already exist with the right settings it says so, changes nothing, and prints their IDs again. If it finds a pool whose sign-in settings are wrong, it explains what's wrong, exits with an error and leaves the pool alone. Cognito can't change those settings on an existing pool, so the fix is a new pool with a different name. Cognito allows two pools with the same name, so if there are two, the command lists both and stops instead of guessing which one you meant.

### Development and production pools

Each environment gets its own pool, chosen by `COGNITO_USER_POOL_NAME`:

| Environment | Pool name | Where |
|---|---|---|
| Your machine, without AWS | `sunday-school-dev` | cognito-local |
| Development and the demo | `sunday-school-dev` | AWS |
| Production | `sunday-school-prod` | AWS |

Accounts don't move between pools, so an account made while testing never shows up in production. Use the same name for the pool and the [DynamoDB table](#create-the-dynamodb-table) of an environment, so each Cognito user's ID (`user_id` in [the data model](data-model.md)) matches a Person in that environment's table. The production pool is created when the app is deployed ([#30](https://github.com/Sunday-School-Software/Sunday-School-Scheduler/issues/30)). Until then, use the development pool.

### In cognito-local

[cognito-local](https://github.com/jagregory/cognito-local) runs a Cognito user pool on your machine, so you don't need an AWS account. It's a community project, not made by AWS. Start it in Docker and leave it running:

```sh
docker run --rm -p 9229:9229 -v sunday-school-cognito:/app/.cognito jagregory/cognito-local
```

The `-v` option keeps the pool in a Docker volume named `sunday-school-cognito`, so the pool, its IDs and the accounts in it are still there after you stop the container. To start over, stop the container and run `docker volume rm sunday-school-cognito`.

Then, in another terminal, create the pool:

```sh
cd api
COGNITO_ENDPOINT=http://localhost:9229 COGNITO_USER_POOL_NAME=sunday-school-dev npm run cognito:create
# Created user pool sunday-school-dev and its app client sunday-school-api.
#
# Put these lines in api/.env:
#
# COGNITO_USER_POOL_ID=local_...
# COGNITO_CLIENT_ID=...
# COGNITO_ENDPOINT=http://localhost:9229
```

With `COGNITO_ENDPOINT` set, you don't need AWS credentials or a region. If it says it couldn't connect, check that the container is running and the port matches.

cognito-local doesn't send email. When someone signs up, it prints their verification code in the terminal where the container is running. It also differs from Cognito in AWS in ways that matter to the API:

- Its tokens' issuer (`iss`) is `http://0.0.0.0:9229/<pool ID>` instead of `https://cognito-idp.<region>.amazonaws.com/<pool ID>`, and its signing keys are at `http://localhost:9229/<pool ID>/.well-known/jwks.json`.
- Sign-in treats letter case in the email as significant, even though the pool is set to ignore it.

### In AWS

You need AWS credentials allowed to call `cognito-idp:ListUserPools`, `cognito-idp:DescribeUserPool`, `cognito-idp:CreateUserPool`, `cognito-idp:ListUserPoolClients`, `cognito-idp:DescribeUserPoolClient` and `cognito-idp:CreateUserPoolClient`, and a region, set the same way as for [the table](#in-aws). Create the pool in the same region as the table. Then:

```sh
cd api
COGNITO_USER_POOL_NAME=sunday-school-dev npm run cognito:create
```

It prints the IDs and the region to put in `api/.env`, as above. The development pool stays within [Cognito's free tier](https://aws.amazon.com/cognito/pricing/).

Until SES is set up (Milestone 2), the pool sends verification emails through Cognito's built-in sender, which sends at most 50 emails a day.

To delete a pool you no longer need, first turn off its deletion protection in the Cognito console.

### Where the IDs go

The API gets its Cognito settings from `api/.env` (or your shell):

| Variable | What it's for |
|---|---|
| `COGNITO_USER_POOL_ID` | The pool's ID, such as `us-east-1_AbCdEf123`. |
| `COGNITO_CLIENT_ID` | The app client's ID. |
| `AWS_REGION` | The pool's region, such as `us-east-1`. Not needed with cognito-local. |
| `COGNITO_ENDPOINT` | Set to `http://localhost:9229` to use cognito-local. |

If you haven't made `api/.env` yet, copy the example and paste in the lines the command printed:

```sh
cd api
cp .env.example .env
```

The IDs aren't secret, since the app client has no secret, but they belong to one environment, so keep them in `.env` rather than in the code.

## Load the seed data

Until leaders can build the schedule in the app (Milestone 2), the data comes from a seed script. `npm run seed` creates:

- Two made-up teachers, **Teacher A** (`teacher.a@example.com`) and **Teacher B** (`teacher.b@example.com`). Each is a Person in the table and a user in the Cognito pool, linked by the user's ID.
- A Gospel Doctrine class taught by Teacher A and a Youth Sunday School class taught by Teacher B on each of the next 4 Sundays, counting today if it's a Sunday.
- A pending assignment for each teacher to each of their classes. Neither teacher is assigned to the other's classes, so you can check that the API rejects a change to someone else's assignment.

You need the [table](#create-the-dynamodb-table) and the [user pool](#create-the-cognito-user-pool) first, in the same environment. The command reads `DYNAMODB_TABLE`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` and `AWS_REGION` (or the two `_ENDPOINT` variables) from `api/.env`, like the commands above, plus one more:

| Variable | What it's for |
|---|---|
| `SEED_PASSWORD` | The password for both seeded accounts. Required, with no default, so the password isn't published in this repository. It needs at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol. |

1. Choose a password and add it to `api/.env` in quotes, as `SEED_PASSWORD="<your password>"`. Without the quotes, a `#` and everything after it is read as a comment and left out of the password. Don't reuse a password from anywhere else: anyone you share the development environment with can sign in with it.

2. Load the data:

   ```sh
   cd api
   npm run seed
   # Created the account teacher.a@example.com.
   # Created the account teacher.b@example.com.
   #
   # Wrote 2 teachers to sunday-school-dev, each with a pending assignment on 2026-11-15, 2026-11-22, 2026-11-29, 2026-12-06.
   # Sign in as teacher.a@example.com or teacher.b@example.com, with SEED_PASSWORD as the password.
   ```

   **Checkpoint:** the last line names both accounts. Your dates will be the next 4 Sundays from the day you run it.

3. Sign in as `teacher.a@example.com` with your `SEED_PASSWORD`. Sign in as `teacher.b@example.com` to try changing Teacher A's assignments.

Running it again is safe, and it's how you reset the data before a demo or a user test. It finds the existing accounts instead of creating new ones and sets their password to `SEED_PASSWORD` again. It replaces the seeded classes and assignments, because their IDs are fixed (they start with `5eed0000`), so every assignment goes back to pending and the classes move to the next 4 Sundays. It leaves anything it didn't create alone.

The seed data is made up. Never put real ward members' names or email addresses in it. To change it, edit `api/src/db/seed.ts` and run the command again.

## When things go wrong

- **`node --version` prints 21, 23, or something older than 20.** The tools these projects use (ESLint, Jest and Vite) don't support those versions. Install Node.js 20.19+, 22.13+, or 24+ and try again.
- **`npm install` fails.** Check you are in the right folder — the API and the UI each have their own `package.json`, so install from `api/` for the API and from `web/` for the UI — and that `node --version` shows a supported version (see above).
- **CI fails at `npm ci` with a message that `package.json` and `package-lock.json` are out of sync.** The lockfile doesn't match `package.json`, usually because a dependency was changed without updating the lockfile. Run `npm install` in that project's folder, commit the updated `package-lock.json`, and push again.
- **The API stops with `EADDRINUSE` (address already in use) for port 3000.** Something is already listening on that port, often the API itself in another terminal. Stop that process, or run the API on another port with `PORT`, for example `PORT=4000 npm run dev`. If you change the API's port, start the UI with the matching `API_URL` (for example `API_URL=http://localhost:4000 npm run dev`) so it forwards `/api` to the right place.
- **The curl checkpoint cannot connect (`Failed to connect`).** The API is not running. Look at the terminal where you ran `npm run dev` for the error it stopped on; if there is none, give it a few seconds to start and try the check again.
- **The UI loads but shows an error instead of `{"status":"ok"}`.** The page reached the UI dev server but not the API. Make sure the API is running (its checkpoint above) and, if you moved it to another port, that the UI was started with the matching `API_URL`.
- **`npm run seed` says the table doesn't exist, or the user pool doesn't exist.** Create them first (see [Create the DynamoDB table](#create-the-dynamodb-table) and [Create the Cognito user pool](#create-the-cognito-user-pool)), and check that `DYNAMODB_TABLE` and `COGNITO_USER_POOL_ID` in `api/.env` are for the same environment.
- **`npm run seed` says the password did not conform with policy.** `SEED_PASSWORD` is too simple for the pool. Use at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol. If your password already has all of those, check that it's in quotes in `api/.env`. Without them, everything from a `#` onward is read as a comment, so Cognito gets only the part before it.
- **`npm start` or `npm run preview` cannot find `dist/`.** Both run the compiled build. Run `npm run build` in the same project first.
