import {
  DatabaseConfigurationError,
  parseDatabaseEnv,
} from '../config/database.ts';
import { EnvironmentConfigurationError, parseEnv } from '../config/env.ts';
import {
  createPool,
  verifyConnection,
} from '../infrastructure/database/pool.ts';
import { buildApp } from './app.ts';

async function start(): Promise<void> {
  const config = parseEnv(process.env);
  const databaseConfig = parseDatabaseEnv(process.env);
  const app = buildApp(config);
  const pool = createPool(databaseConfig, () =>
    app.log.error('Unexpected idle PostgreSQL client error'),
  );

  let closing: Promise<void> | undefined;
  const startup = (async () => {
    try {
      await verifyConnection(pool);
    } catch {
      app.log.error('PostgreSQL connection check failed during startup');
      throw new Error('PostgreSQL startup check failed');
    }
    if (closing) return;
    try {
      await app.listen({ host: config.HOST, port: config.PORT });
    } catch {
      app.log.error('HTTP server failed to bind');
      throw new Error('HTTP listener startup failed');
    }
  })();

  function close(): Promise<void> {
    closing ??= startup
      .catch(() => undefined)
      .then(async () => {
        try {
          await app.close();
          app.log.info('HTTP server shutdown complete');
        } catch {
          app.log.error('HTTP server shutdown failed');
          process.exitCode = 1;
        } finally {
          try {
            await pool.end();
          } catch {
            app.log.error('PostgreSQL pool shutdown failed');
            process.exitCode = 1;
          }
        }
      });
    return closing;
  }

  function shutdown(signal: NodeJS.Signals): void {
    if (closing) return;
    app.log.info({ signal }, 'HTTP server shutting down');
    void close();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await startup;
  } catch {
    process.exitCode = 1;
    await close();
  }
}

try {
  await start();
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg:
        error instanceof DatabaseConfigurationError ||
        error instanceof EnvironmentConfigurationError
          ? error.message
          : 'Server startup failed',
    }),
  );
  process.exitCode = 1;
}
