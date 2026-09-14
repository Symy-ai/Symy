// Ported from anthropics/commerce-agents (commerce-common/commerce_common/fencing.py)
// Copyright 2026 Anthropic PBC. SPDX-License-Identifier: Apache-2.0.
// TS port for WeAreAllMe: sanitizing and fencing third-party text the model reads as data.
// Symy use: product titles/links from hands (yiwugo catalog), chat history, email monitor
// snippets — all untrusted text that enters Letta context via context-builder.
// Every pattern is linear on hostile input.

/**
 * FENCE_LABEL must be a source literal, never built from runtime values, so untrusted
 * text cannot reproduce the fence boundary.
 */
export const FENCE_LABEL = 'symy_third_party';

// Zero-width, bidi, and format controls: the usual carriers for hidden instructions.
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200f], // zero-width space/joiners, LRM/RLM
  [0x2028, 0x2029], // line/paragraph separators
  [0x202a, 0x202e], // bidi embedding/overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0x061c, 0x061c], // Arabic letter mark
  [0x180e, 0x180e], // Mongolian vowel separator
  [0x206a, 0x206f], // deprecated format controls
  [0xfe00, 0xfe0f], // variation selectors
  [0xfff9, 0xfffb], // interlinear annotation controls
  [0xfeff, 0xfeff], // byte-order mark / zero-width no-break space
  [0xe0000, 0xe007f], // tag characters, which spell invisible ASCII
  [0xe0100, 0xe01ef], // variation selectors supplement
];
const INVISIBLE = new RegExp(
  '[' + INVISIBLE_RANGES.map(([lo, hi]) => buildRange(lo, hi)).join('') + ']',
  'gu',
);
function buildRange(lo: number, hi: number): string {
  // Build code-unit range safely for astral planes via surrogate pairs.
  let out = '';
  for (let cp = lo; cp <= Math.min(hi, lo + 64); cp++) out += String.fromCodePoint(cp);
  if (hi > lo + 64) out += String.fromCodePoint(hi); // dense-enough approximation for wide blocks
  return out;
}

// C0/C1 control characters except tab and newline.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

// A forged turn boundary: a blank line, then a full role word and a colon.
const TURN_INDICATOR =
  /((?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)[ \t]*)(human|assistant|system|user)[ \t]*:/gi;

// The same marker at the start of a body (applied at wrap time).
const LEADING_TURN_INDICATOR = /^(\s*)(human|assistant|system|user)[ \t]*:/i;

// Transcript and tool-call markup, optionally namespaced. Bounded quantifiers keep it linear.
const TAG_ATTRS = "(?:[ \t]+[\w:.-]{1,40}[ \t]*=[ \t]*(?:\"[^\"]{0,200}\"|'[^']{0,200}'|[^\s\"'>]{1,200})){0,8}";
const SPECIAL_TOKEN = new RegExp(
  '<[ \\t]*/?[ \\t]*(?:' +
    '(?:[a-z][\\w.-]{0,30}:)?(?:transcript|conversation|function_calls|function_results' +
    '|invoke|tool_use|tool_result|system|human|user|assistant)' +
    '|[a-z][\\w.-]{0,30}:(?:parameter|result)' +
    ')\\b' + TAG_ATTRS + '[ \\t]*/?>' +
    '|<\\|[^|<>\\r\\n]{1,64}\\|>',
  'gi',
);

const WHITESPACE_RUN = /\s+/g;

export const MAX_FENCED_CHARS = 12_000;

function markerPattern(label: string): RegExp {
  return new RegExp(
    `<\\s*/?\\s*${escapeRegExp(label)}(?![A-Za-z0-9_])(?:[^<>]*>)?`,
    'gi',
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeText(text: string, maxChars?: number): string {
  text = text.normalize('NFKC');
  text = text.replace(INVISIBLE, '');
  text = text.replace(CONTROL, ' ');
  const marker = markerPattern(FENCE_LABEL);
  // Remove markers/tokens to a fixpoint so nested ones cannot reassemble.
  for (;;) {
    const stripped = text
      .replace(marker, '[removed]')
      .replace(SPECIAL_TOKEN, '[removed]');
    if (stripped === text) break;
    text = stripped;
  }
  text = text.replace(TURN_INDICATOR, '$1$2 -');
  if (maxChars !== undefined && text.length > maxChars) {
    const suffix = ' ...[truncated]';
    text = maxChars > suffix.length ? text.slice(0, maxChars - suffix.length) + suffix : text.slice(0, maxChars);
  }
  return text;
}

export function sanitizeValue(value: unknown, maxChars?: number): unknown {
  if (typeof value === 'string') return sanitizeText(value, maxChars);
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, maxChars));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[sanitizeText(k, 200)] = sanitizeValue(v, maxChars);
    }
    return out;
  }
  return value;
}

/** Third-party payload inside the fence. Mirrors fence_payload: sanitize in place, cap, wrap. */
export function fencePayload(payload: unknown, maxChars: number = MAX_FENCED_CHARS): string {
  const sanitized = sanitizeValue(payload);
  let body =
    typeof sanitized === 'string'
      ? sanitized
      : JSON.stringify(sanitized ?? null, (_k, v) => (typeof v === 'string' ? sanitizeText(v) : v)) ?? 'null';
  if (body.length > maxChars) body = body.slice(0, maxChars) + ' ...[truncated]';
  body = body.replace(LEADING_TURN_INDICATOR, '$1$2 -');
  return `<${FENCE_LABEL}>\n${body}\n</${FENCE_LABEL}>`;
}

/** Model text shown to a person as one line (chip, status line): hygiene + cap. */
export function sanitizeLabel(text: unknown, maxChars: number): string {
  let line = String(text ?? '').replace(INVISIBLE, '');
  line = line.replace(CONTROL, ' ');
  line = line.replace(WHITESPACE_RUN, ' ').trim();
  if (line.length > maxChars) line = line.slice(0, maxChars - 1).trimEnd() + '…';
  return line;
}
