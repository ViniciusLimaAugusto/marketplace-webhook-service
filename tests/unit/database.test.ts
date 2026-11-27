import { describe, expect, it, vi } from 'vitest';
import { parseDatabaseEnv } from '../../src/config/database.ts';
import { verifyConnection } from '../../src/infrastructure/database/pool.ts';
import {
  parseIntegrationTarget,
  verifyIntegrationTarget,
} from '../integration/target.ts';

const appUrl =
  'postgresql://marketplace_app:example%40password@localhost:5432/marketplace_webhook_service';
const testUrl =
  'postgres://marketplace_test:test-password@localhost/marketplace_webhook_service_test';

describe('database configuration', () => {
  it('accepts explicit PostgreSQL URLs and supplies pool defaults', () => {
    expect(parseDatabaseEnv({ DATABASE_URL: appUrl })).toEqual({
      connectionString: appUrl,
      DB_POOL_MAX: 10,
      DB_CONNECTION_TIMEOUT_MS: 5_000,
      DB_IDLE_TIMEOUT_MS: 30_000,
    });
    expect(
      parseIntegrationTarget({
        DATABASE_URL: appUrl,
        TEST_DATABASE_URL: testUrl,
      }).connectionString,
    ).toBe(testUrl);
  });

  it('parses pool overrides', () => {
    expect(
      parseDatabaseEnv({
        DATABASE_URL: appUrl,
        DB_POOL_MAX: '1',
        DB_CONNECTION_TIMEOUT_MS: '60000',
        DB_IDLE_TIMEOUT_MS: '300000',
      }),
    ).toMatchObject({
      DB_POOL_MAX: 1,
      DB_CONNECTION_TIMEOUT_MS: 60_000,
      DB_IDLE_TIMEOUT_MS: 300_000,
    });
  });

  it.each([
    undefined,
    'https://user:secret@localhost/db',
    'postgres://user:secret@localhost/',
    'postgres://user:secret@localhost/db%ZZ',
  ])('rejects missing or invalid URLs without including the input', (url) => {
    expect(() => parseDatabaseEnv({ DATABASE_URL: url })).toThrow(
      /^Invalid environment configuration: DATABASE_URL$/,
    );
  });

  it.each([
    ['DB_POOL_MAX', '101'],
    ['DB_POOL_MAX', '0'],
    ['DB_CONNECTION_TIMEOUT_MS', '-1'],
    ['DB_CONNECTION_TIMEOUT_MS', '60001'],
    ['DB_IDLE_TIMEOUT_MS', '1.5'],
    ['DB_IDLE_TIMEOUT_MS', '300001'],
  ])('rejects an invalid %s value', (name, value) => {
    expect(() =>
      parseDatabaseEnv({ DATABASE_URL: appUrl, [name]: value }),
    ).toThrow(name);
  });
});

describe('integration target safeguards', () => {
  it('requires an explicit TEST_DATABASE_URL', () => {
    expect(() => parseIntegrationTarget({ DATABASE_URL: appUrl })).toThrow(
      'TEST_DATABASE_URL',
    );
  });

  it.each([
    appUrl,
    'postgres://marketplace_test@localhost/postgres',
    'postgres://postgres@localhost/marketplace_webhook_service_test',
    'postgres://marketplace_test@localhost/marketplace_webhook_service_test?database=postgres',
  ])('rejects an unsafe test target', (url) => {
    expect(() => parseIntegrationTarget({ TEST_DATABASE_URL: url })).toThrow(
      'TEST_DATABASE_URL',
    );
  });

  it('rejects a shared database regardless of host alias, credentials or URL encoding', () => {
    const DATABASE_URL =
      'postgresql://another_role@127.0.0.1:5432/marketplace_webhook_service_%74est';
    expect(() =>
      parseIntegrationTarget({ DATABASE_URL, TEST_DATABASE_URL: testUrl }),
    ).toThrow('DATABASE_URL also identifies');
  });

  it('checks the server-reported database and role privileges', async () => {
    const target = {
      database: 'marketplace_webhook_service_test',
      role: 'marketplace_test',
      login: 'marketplace_test',
      isolated: true,
    };
    const query = vi.fn().mockResolvedValue({ rows: [target] });
    await expect(verifyIntegrationTarget({ query })).resolves.toBeUndefined();
    for (const mismatch of [
      { database: 'marketplace_webhook_service' },
      { role: 'postgres' },
      { login: 'postgres' },
      { isolated: false },
    ]) {
      query.mockResolvedValueOnce({ rows: [{ ...target, ...mismatch }] });
      await expect(verifyIntegrationTarget({ query })).rejects.toThrow(
        'did not verify',
      );
    }
  });
});

it('replaces raw driver errors with a credential-free connection failure', async () => {
  const query = vi.fn().mockRejectedValue(new Error(appUrl));
  await expect(verifyConnection({ query })).rejects.toThrow(
    /^PostgreSQL connection check failed$/,
  );
  expect(query).toHaveBeenCalledWith('SELECT 1');
});
