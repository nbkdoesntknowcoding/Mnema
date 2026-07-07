import type { LoggerOptions } from 'pino';
import { config } from '../config/env.js';

/**
 * Credential-bearing paths scrubbed from every log line before it is written.
 * pino's `redact` walks these exact paths (and array wildcards `*`) and replaces
 * matches with the censor below. Covers Fastify's request/response serializer
 * shapes (`req.headers.*`) as well as ad-hoc objects we log directly.
 */
const REDACT_PATHS = [
  // Auth headers on the serialized request.
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["proxy-authorization"]',
  'headers.authorization',
  'headers.cookie',
  // Common credential field names, at top level and one nesting level deep.
  'authorization',
  'apiKey',
  'api_key',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'encryptedKey',
  'secret',
  '*.apiKey',
  '*.api_key',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.encryptedKey',
  '*.encrypted_key',
  '*.secret',
];

const CENSOR = '[REDACTED]';

// Matches provider secret keys of the `sk-...` shape (OpenAI/Anthropic/etc.):
// `sk-` optionally followed by a segment tag (e.g. `sk-proj-`, `sk-ant-`) and a
// long base62-ish body. Kept deliberately broad; only the visible key body is masked.
const SK_KEY_RE = /sk-(?:[A-Za-z0-9]+-)*[A-Za-z0-9]{20,}/g;

/**
 * Recursively replace `sk-…` secret-key substrings with `sk-***` anywhere in a
 * logged value. Redaction (above) handles known field NAMES; this catches keys
 * that leak inside free-form strings (error messages, URLs, request bodies)
 * regardless of their key. Depth-bounded and cycle-safe so it can't blow the
 * stack or loop on self-referential objects.
 */
function scrubSecretKeys(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') {
    return value.includes('sk-') ? value.replace(SK_KEY_RE, 'sk-***') : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => scrubSecretKeys(v, seen, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = scrubSecretKeys(v, seen, depth + 1);
  }
  return out;
}

export const loggerOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: CENSOR,
  },
  formatters: {
    // Runs on the merged log object of every line; masks any stray `sk-…` key
    // that slipped past path-based redaction (e.g. embedded in a message string).
    log(obj: Record<string, unknown>): Record<string, unknown> {
      return scrubSecretKeys(obj, new WeakSet(), 0) as Record<string, unknown>;
    },
  },
  ...(config.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
};
