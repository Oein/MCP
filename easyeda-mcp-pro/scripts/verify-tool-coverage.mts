import { EnvSchema } from '../src/config/env.js';
import { PROFILE_DEFINITIONS, type ToolProfile } from '../src/config/profiles.js';
import { registerBuiltinTools } from '../src/tools/register.js';
import { ToolRegistry } from '../src/tools/registry.js';

const checkedProfiles: ToolProfile[] = ['core', 'pro', 'full', 'dev'];

function getToolCount(profile: ToolProfile): number {
  const registry = new ToolRegistry();
  registry.setProfile(profile);
  registerBuiltinTools(registry, EnvSchema.parse({ NODE_ENV: 'test' }));
  return registry.getEnabledTools().length;
}

function assertProfileCount(profile: ToolProfile): void {
  const actual = getToolCount(profile);
  const expected = Number(PROFILE_DEFINITIONS[profile].approxToolCount);
  if (!Number.isInteger(expected)) {
    throw new Error(`Profile ${profile} does not declare a numeric approxToolCount.`);
  }
  if (actual !== expected) {
    throw new Error(
      `Profile ${profile} exposes ${actual} tools but approxToolCount is ${expected}.`,
    );
  }
  console.log(`OK: ${profile} exposes ${actual} tools`);
}

for (const profile of checkedProfiles) {
  assertProfileCount(profile);
}
