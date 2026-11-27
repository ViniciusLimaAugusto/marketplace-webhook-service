import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.ts';

describe('environment configuration', () => {
  it('uses defaults for missing variables', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('accepts custom values and converts the port to a number', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
        LOG_LEVEL: 'debug',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: 8080,
      LOG_LEVEL: 'debug',
    });
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '65536'],
    ['PORT', ''],
    ['PORT', '1.5'],
    ['PORT', '1e3'],
    ['HOST', '   '],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
  ])('rejects invalid %s (%j)', (name, value) => {
    expect(() => parseEnv({ [name]: value })).toThrow(
      `Invalid environment configuration: ${name}`,
    );
  });
});
