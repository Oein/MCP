import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EasyedaApiMethodSchema } from '../../../src/bridge/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dispatcherSourcePath = resolve(
  __dirname,
  '../../../easyeda-bridge-extension/src/dispatcher.ts',
);

function extractDispatcherMethodList(source: string): string[] {
  const match = source.match(/const METHOD_LIST:[\s\S]*?= \[([\s\S]*?)\];/);
  if (!match) throw new Error('Could not locate dispatcher METHOD_LIST');
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

describe('extension dispatcher method registry parity', () => {
  it('matches the server EasyedaApiMethodSchema exactly', () => {
    const extensionMethods = extractDispatcherMethodList(
      readFileSync(dispatcherSourcePath, 'utf8'),
    );
    const serverMethods = [...EasyedaApiMethodSchema.options];

    expect(new Set(extensionMethods).size).toBe(extensionMethods.length);
    expect([...extensionMethods].sort()).toEqual([...serverMethods].sort());
  });
});
