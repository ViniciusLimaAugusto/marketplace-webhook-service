import { parseEnv } from '../config/env.ts';
import { buildApp } from './app.ts';

async function start(): Promise<void> {
  const config = parseEnv(process.env);
  const app = buildApp(config);
  const listening = app.listen({ host: config.HOST, port: config.PORT });
  let closing: Promise<void> | undefined;

  function close(signal?: NodeJS.Signals): Promise<void> {
    closing ??= listening
      .catch(() => undefined)
      .then(() => app.close())
      .then(() => {
        if (signal) app.log.info({ signal }, 'HTTP server shutdown complete');
      })
      .catch((err: unknown) => {
        app.log.error({ err, signal }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      });
    return closing;
  }

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (closing) return;
    app.log.info({ signal }, 'HTTP server shutting down');
    await close(signal);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await listening;
  } catch (err) {
    app.log.error({ err }, 'HTTP server startup failed');
    process.exitCode = 1;
    await close();
  }
}

try {
  await start();
} catch (error) {
  // Configuration errors contain only the names of invalid variables.
  console.error(
    JSON.stringify({
      level: 'error',
      msg:
        error instanceof Error ? error.message : 'HTTP server startup failed',
    }),
  );
  process.exitCode = 1;
}
