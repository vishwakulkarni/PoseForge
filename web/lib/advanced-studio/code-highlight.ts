/**
 * Minimal JSON/YAML tokenizer for the prompt node's "structured" mode.
 *
 * Deliberately not a real YAML parser — it is a best-effort colorizer over
 * the raw text the user is editing, not a validator. JSON gets a proper
 * tokenizer (and can therefore be pretty-printed); YAML gets a line-based
 * approximation that is good enough to read at a glance.
 */

export interface HighlightToken {
  text: string;
  cls?: 'tok-key' | 'tok-string' | 'tok-number' | 'tok-boolean' | 'tok-null' | 'tok-comment';
}

const JSON_TOKEN_RE = /("(?:\\u[0-9a-fA-F]{4}|\\.|[^"\\])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function highlightJson(text: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(JSON_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: text.slice(lastIndex, index) });
    const value = match[0];
    let cls: HighlightToken['cls'] = 'tok-number';
    if (value.startsWith('"')) cls = match[2] ? 'tok-key' : 'tok-string';
    else if (value === 'true' || value === 'false') cls = 'tok-boolean';
    else if (value === 'null') cls = 'tok-null';
    tokens.push({ text: value, cls });
    lastIndex = index + value.length;
  }
  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex) });
  return tokens;
}

/** Attempts to pretty-print JSON with 2-space indentation. Returns null for
 * anything that does not parse, so callers can disable the format action
 * instead of clobbering a draft that merely looks like JSON. */
export function tryFormatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

const YAML_KEY_RE = /^(\s*(?:-\s+)?)([^:#\s][^:#]*?)(:)(\s|$)/;
const YAML_VALUE_TOKEN_RE = /("(?:\\.|[^"\\])*"|'(?:[^'])*'|\b(?:true|false|yes|no|null|~)\b|-?\b\d+(?:\.\d+)?\b)/gi;

function highlightYamlValue(text: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(YAML_VALUE_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: text.slice(lastIndex, index) });
    const value = match[0];
    let cls: HighlightToken['cls'] = 'tok-string';
    if (/^-?\d/.test(value)) cls = 'tok-number';
    else if (/^(true|false|yes|no)$/i.test(value)) cls = 'tok-boolean';
    else if (/^(null|~)$/i.test(value)) cls = 'tok-null';
    tokens.push({ text: value, cls });
    lastIndex = index + value.length;
  }
  if (lastIndex < text.length) tokens.push({ text: text.slice(lastIndex) });
  return tokens;
}

function highlightYamlLine(line: string): HighlightToken[] {
  const commentIndex = line.indexOf('#');
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : '';

  const tokens: HighlightToken[] = [];
  const keyMatch = code.match(YAML_KEY_RE);
  if (keyMatch) {
    const [, lead, key, colon, tail] = keyMatch;
    tokens.push({ text: lead });
    tokens.push({ text: key, cls: 'tok-key' });
    tokens.push({ text: colon });
    const rest = code.slice(keyMatch[0].length - tail.length);
    tokens.push(...highlightYamlValue(rest));
  } else {
    tokens.push(...highlightYamlValue(code));
  }
  if (comment) tokens.push({ text: comment, cls: 'tok-comment' });
  return tokens;
}

export function highlightYaml(text: string): HighlightToken[] {
  const lines = text.split('\n');
  const tokens: HighlightToken[] = [];
  lines.forEach((line, index) => {
    tokens.push(...highlightYamlLine(line));
    if (index < lines.length - 1) tokens.push({ text: '\n' });
  });
  return tokens;
}

export function highlightStructuredText(text: string): HighlightToken[] {
  return looksLikeJson(text) ? highlightJson(text) : highlightYaml(text);
}
