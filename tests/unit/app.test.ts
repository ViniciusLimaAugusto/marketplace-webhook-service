import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/api/app.ts';

describe('HTTP application', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp({ LOG_LEVEL: 'silent' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the root contract without listening on a network port', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'marketplace-webhook-service',
      status: 'running',
    });
    expect(app.server.listening).toBe(false);
  });

  it('returns 404 for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/unknown' });

    expect(response.statusCode).toBe(404);
  });
});
