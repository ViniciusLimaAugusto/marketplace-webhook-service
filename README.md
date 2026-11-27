# Marketplace Webhook Service

A TypeScript backend for receiving and processing synthetic marketplace events. Marketplaces can resend notifications or deliver them while a downstream component is unavailable. The project aims to accept events durably, avoid duplicate business effects, and recover processing after failures.

## Current status

The project foundation provides a Fastify HTTP application, validated configuration, structured JSON logs, graceful shutdown, and a root endpoint for smoke testing. The development stack uses Node.js 24, npm, TypeScript, Fastify, Zod, Pino, Vitest, ESLint, Prettier, and GitHub Actions.

The planned architecture adds webhook ingestion to the HTTP API. PostgreSQL will store events durably, and an independent worker will claim and process them with concurrency control, idempotency, and recovery after failures. These capabilities are planned for future issues.

## Project structure

- `src/api/app.ts` builds the Fastify application.
- `src/api/server.ts` starts and shuts down the HTTP server.
- `src/api/routes/root.ts` registers the smoke-test route.
- `src/config/env.ts` validates environment variables.
- `tests/unit/` covers the HTTP contract and configuration.
- `.github/workflows/ci.yml` runs the verification pipeline.

## Getting started

Install Node.js 24 LTS and npm. Run `npm ci` to install dependencies from the lockfile, then run `npm run dev` to start the development server with automatic reload.

Development uses Node's native environment-file support. Copy `.env.example` to `.env` to override defaults. Variables already set in the environment take precedence over entries in the file. Restart the development command after editing `.env`.

For production, run `npm run build` followed by `npm start`. The start script runs the compiled JavaScript in `dist/` and reads variables supplied by the process environment. Set `NODE_ENV=production` in the deployment environment.

| Variable    | Default       | Accepted values                                              |
| ----------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development`, `test`, `production`                          |
| `HOST`      | `127.0.0.1`   | Non-empty string                                             |
| `PORT`      | `3000`        | Decimal integer from 1 to 65535                              |
| `LOG_LEVEL` | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

### Smoke test

Send `GET /` to the running server.

```sh
curl http://127.0.0.1:3000/
```

The server responds with HTTP 200 and the following JSON.

```json
{
  "service": "marketplace-webhook-service",
  "status": "running"
}
```

## npm scripts

Run `npm test` for a single Vitest run or `npm run test:watch` while developing. The HTTP tests use Fastify injection and require no listening port.

| Command                | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Start the development server with automatic reload          |
| `npm run build`        | Compile production TypeScript into `dist/`                  |
| `npm start`            | Run the compiled server                                     |
| `npm run typecheck`    | Type-check source and tests                                 |
| `npm run lint`         | Check ESLint rules                                          |
| `npm run lint:fix`     | Apply supported ESLint fixes                                |
| `npm run format`       | Format project files                                        |
| `npm run format:check` | Verify formatting                                           |
| `npm test`             | Run automated tests once                                    |
| `npm run test:watch`   | Run automated tests in watch mode                           |
| `npm run check`        | Verify formatting, lint, types, tests, and production build |
