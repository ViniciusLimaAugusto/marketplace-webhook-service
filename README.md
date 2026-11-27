# Marketplace Webhook Service

A TypeScript backend for receiving and processing synthetic marketplace events. Marketplaces can resend notifications or deliver them while a downstream component is unavailable. The project aims to accept events durably, avoid duplicate business effects, and recover processing after failures.

## Requirements

Use Node.js 24 LTS and npm. PostgreSQL 18 is the reference for CI and Compose.
For native development, the minimum supported version is PostgreSQL 15, the
oldest major release still maintained upstream when this setup was introduced.
The pool, migration history, and test fixture use standard connection,
transaction, advisory lock, schema, and table operations available in 15.
Keep an existing supported installation and use its latest minor release.
See the [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/).

## Option A — Native development (recommended)

1. Install Node.js 24 LTS and verify it with `node --version`.
2. Open SQL Shell (psql) from the Windows Start menu, or connect in pgAdmin or
   DBeaver. Connect to the `postgres` maintenance database as a PostgreSQL
   administrator. Run `SELECT version();` to check the **server** version.
3. In the maintenance database, create the dedicated roles and databases using
   the SQL below. Use autocommit and run each `CREATE DATABASE` as a standalone
   statement. Replace both password placeholders with different local passwords.
   If the objects already exist, review their owners and privileges with the
   administrator before reusing them. With psql, you can create login roles
   without the `PASSWORD` clauses and set their passwords interactively using
   `\password marketplace_app` and `\password marketplace_test`.

   ```sql
   CREATE ROLE marketplace_app LOGIN PASSWORD 'REPLACE_WITH_LOCAL_APP_PASSWORD';
   CREATE ROLE marketplace_test LOGIN PASSWORD 'REPLACE_WITH_LOCAL_TEST_PASSWORD';

   CREATE DATABASE marketplace_webhook_service OWNER marketplace_app;
   CREATE DATABASE marketplace_webhook_service_test OWNER marketplace_test;

   REVOKE ALL ON DATABASE marketplace_webhook_service FROM PUBLIC;
   REVOKE ALL ON DATABASE marketplace_webhook_service_test FROM PUBLIC;
   ```

4. Connect to **each** new database as the administrator. In
   `marketplace_webhook_service`, run the first pair of statements. In
   `marketplace_webhook_service_test`, run the second pair. In psql, use
   `\connect marketplace_webhook_service` or
   `\connect marketplace_webhook_service_test`. In pgAdmin or DBeaver, open
   a query editor attached to the corresponding database.

   ```sql
   -- In marketplace_webhook_service
   REVOKE ALL ON SCHEMA public FROM PUBLIC;
   GRANT USAGE, CREATE ON SCHEMA public TO marketplace_app;

   -- In marketplace_webhook_service_test
   REVOKE ALL ON SCHEMA public FROM PUBLIC;
   GRANT USAGE, CREATE ON SCHEMA public TO marketplace_test;
   ```

   Each role owns its database and can create schemas and run migrations there.
   Keep the roles unprivileged at the cluster level and grant neither role
   membership in the other. Revoking the default `PUBLIC` database privileges
   removes the implicit cross-database `CONNECT` grant. If reusing a cluster,
   review explicit grants and role memberships as well.

5. In PowerShell at the repository root, copy the example configuration.

   ```powershell
   Copy-Item .env.example .env
   ```

   Replace the `CHANGE_ME` values in `.env`. Keep `localhost` for a local
   installation and change the port if PostgreSQL uses a different one.
   Percent-encode the password component only. For example, a password
   containing `@`, `#`, or `%` uses `%40`, `%23`, or `%25` at those
   positions. Process environment variables override file entries.

6. Install dependencies, check connectivity, apply migrations, and start the API.

   ```powershell
   npm ci
   npm run db:check
   npm run db:migrate
   npm run dev
   ```

7. In a second PowerShell window, verify the endpoint and run the tests.

   ```powershell
   Invoke-RestMethod http://127.0.0.1:3000/
   npm test
   npm run test:integration
   ```

The root endpoint returns HTTP 200 with
`{"service":"marketplace-webhook-service","status":"running"}`.
The server checks PostgreSQL before opening the HTTP listener. On shutdown it
closes the HTTP application before draining the PostgreSQL pool.

To run compiled JavaScript, execute `npm run build` and `npm start` with the
required environment variables already exported by the process environment.
Use `NODE_ENV=production` for deployment.

## Option B — Optional Docker Compose

The demonstration defaults are `demo-app-only` and `demo-admin-only`. To
override them before the first initialization, supply `COMPOSE_APP_PASSWORD`
and `COMPOSE_ADMIN_PASSWORD` in your shell or Compose environment file. Use
URL-safe characters for the app password (letters, digits, and hyphens work).
Set `COMPOSE_API_PORT` to change the loopback HTTP port. Compose connects to
PostgreSQL through its private network using the `db` hostname. PostgreSQL has
no published host port.

```powershell
$env:COMPOSE_API_PORT = '3001'
docker compose config --quiet
docker compose build
docker compose up --wait db
docker compose run --rm api node dist/infrastructure/database/command.js up
docker compose up --wait api
Invoke-RestMethod http://127.0.0.1:3001/
docker compose ps
docker compose logs api db
docker compose down
```

The PostgreSQL initialization script runs when the named volume is empty.
Changing environment variables after initialization does not rotate existing
database passwords. `docker compose down` preserves the volume. Adding
`--volumes` deletes it, including all stored databases and migration history.

## Database configuration

| Variable                   | Default                                           | Purpose                                       |
| -------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `DATABASE_URL`             | Required for server startup and database commands | Explicit PostgreSQL host, role, and database  |
| `TEST_DATABASE_URL`        | Required for integration tests                    | Dedicated test database connection            |
| `DB_POOL_MAX`              | `10`                                              | Maximum pool connections, 1–100               |
| `DB_CONNECTION_TIMEOUT_MS` | `5000`                                            | Connection timeout in milliseconds, 1–60000   |
| `DB_IDLE_TIMEOUT_MS`       | `30000`                                           | Idle client timeout in milliseconds, 1–300000 |
| `NODE_ENV`                 | `development`                                     | `development`, `test`, or `production`        |
| `HOST`                     | `127.0.0.1`                                       | HTTP bind address                             |
| `PORT`                     | `3000`                                            | HTTP port, 1–65535                            |
| `LOG_LEVEL`                | `info`                                            | Fastify log level                             |

Both `postgres://` and `postgresql://` are accepted. `.env` files are
ignored by Git and excluded from Docker build contexts.

### Connection troubleshooting

If the connectivity check fails, confirm the PostgreSQL service is running
and the host and port match the server settings. Verify the database and login
using SQL Shell or your GUI. Check password encoding and any environment
variable set in the current shell. The startup and database command logs omit
connection strings and raw driver errors. If a migration fails, inspect the
migration SQL and history on the selected database before retrying.

## Migrations

Versioned SQL migrations are stored in `migrations/`. The runner records
applied migrations in `public.pgmigrations` and uses a PostgreSQL advisory lock
to prevent concurrent migration runs against the same database. The directory
starts empty pending the domain schema in issue #4.

| Command                                      | Purpose                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `npm run db:check`                           | Connect to `DATABASE_URL` and execute `SELECT 1`         |
| `npm run db:migrate`                         | Apply pending migrations to `DATABASE_URL`               |
| `npm run db:rollback`                        | Roll back the latest applied migration in `DATABASE_URL` |
| `npm run db:migration:create -- add-example` | Create a timestamped SQL migration without connecting    |

Select a migration target with `DATABASE_URL` in your shell or `.env`.
Review the target and the migration's down statements before rolling back.
Run migrations once for the target before starting API instances. For image-based
execution, use `node dist/infrastructure/database/command.js up` or `down`
with the target supplied by the container environment.

## Testing

`npm test` and `npm run test:watch` use the unit suite.
`npm run check` runs formatting, lint, type checking, unit tests, and the
production build. These commands work without PostgreSQL or Docker.

`npm run test:integration` uses real PostgreSQL. It requires an explicit
`TEST_DATABASE_URL` for `marketplace_webhook_service_test` using the
`marketplace_test` login, with no URL query parameters. The suite rejects
`DATABASE_URL` values that name the test database even through a different
host alias or credentials. Before writing, it verifies the database, login,
effective role, database ownership, and development database access on the
same PostgreSQL session it uses for the migration fixture. It cleans up only
the uniquely named schema it creates. These checks are defense in depth.
Enforce the database-level privileges above and use disposable test credentials
and databases exclusively for this suite.

GitHub Actions runs the repository checks, the integration suite against an
isolated PostgreSQL 18 service, and a Compose smoke test.
