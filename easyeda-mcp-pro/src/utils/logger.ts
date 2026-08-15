import pino from 'pino';
import { type EnvConfig } from '../config/env.js';

let loggerInstance: pino.Logger | null = null;

export function createLogger(config: Pick<EnvConfig, 'LOG_LEVEL' | 'NODE_ENV'>): pino.Logger {
  if (loggerInstance) return loggerInstance;

  const pinoOpts: pino.LoggerOptions = {
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV !== 'production'
      ? { transport: { target: 'pino/file', options: { destination: 2 } } }
      : {}),
    redact: {
      paths: [
        'apiKey',
        'api_key',
        'API_KEY',
        'clientSecret',
        'client_secret',
        'CLIENT_SECRET',
        'token',
        'TOKEN',
        'sessionToken',
        'session_token',
        'password',
        'PASSWORD',
        'authorization',
        'AUTHORIZATION',
        'cookie',
        'COOKIE',
        'jwt',
        'JWT',
        'secret',
        'SECRET',
        'key',
        'KEY',
        'credential',
        'CREDENTIAL',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  loggerInstance = pino(pinoOpts);

  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call createLogger first.');
  }
  return loggerInstance;
}
