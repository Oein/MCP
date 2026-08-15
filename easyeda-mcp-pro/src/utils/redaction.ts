const SECRET_PATTERNS: Array<RegExp> = [
  /(api[_-]?key\s*[:=]\s*)(['"]?[a-zA-Z0-9_-]+['"]?)/gi,
  /(client[_-]?secret\s*[:=]\s*)(['"]?[a-zA-Z0-9_-]+['"]?)/gi,
  /(token\s*[:=]\s*)(['"]?[a-zA-Z0-9_\-.:=]+['"]?)/gi,
  /(password\s*[:=]\s*)(['"]?[^\s'"]+['"]?)/gi,
  /(bearer\s+)([a-zA-Z0-9_\-.:=]+)/gi,
  /(-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)([\s\S]*?)(-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/gi,
  /(authorization:\s*bearer\s+)([a-zA-Z0-9_\-.:=]+)/gi,
];

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, prefix) => {
      return `${prefix}[REDACTED]`;
    });
  }
  return result;
}

export function redactObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return redactSecrets(obj) as unknown as T;
  }
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactObject) as unknown as T;
  }
  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('credential') ||
        lowerKey === 'authorization' ||
        lowerKey === 'cookie'
      ) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = redactObject(value);
      } else if (typeof value === 'string') {
        redacted[key] = redactSecrets(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted as unknown as T;
  }
  return obj;
}
