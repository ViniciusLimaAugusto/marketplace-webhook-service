import type { FastifyInstance } from 'fastify';

export function registerRootRoute(app: FastifyInstance): void {
  app.get('/', () => ({
    service: 'marketplace-webhook-service',
    status: 'running',
  }));
}
