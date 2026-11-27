import Fastify from 'fastify';
import type { Env } from '../config/env.ts';
import { registerRootRoute } from './routes/root.ts';

export function buildApp(config: Pick<Env, 'LOG_LEVEL'>) {
  const app = Fastify({
    exposeHeadRoutes: false,
    requestIdHeader: false,
    logger: {
      level: config.LOG_LEVEL,
      redact: { paths: ['err.rawPacket'], remove: true },
      serializers: {
        req(request: { method: string }) {
          return { method: request.method };
        },
      },
    },
  });

  registerRootRoute(app);
  return app;
}
