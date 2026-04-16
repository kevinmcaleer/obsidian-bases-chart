import { NoteData } from './baseParser';

/**
 * Evaluate a value expression against a note.
 * Supported functions:
 *   daysSince(prop)  — days between the property's date and today
 *   daysUntil(prop)  — days from today to the property's date
 *   year(prop)       — extract 4-digit year
 *   month(prop)      — extract month (1-12)
 *   day(prop)        — extract day of month (1-31)
 *
 * Also supports bare property names (returns the raw numeric value).
 */
export function evaluateExpression(expr: string, note: NoteData): number {
  const trimmed = expr.trim();

  // Function call: name(arg)
  const fnMatch = trimmed.match(/^(\w+)\((.+)\)$/);
  if (fnMatch) {
    const fnName = fnMatch[1].toLowerCase();
    const arg = fnMatch[2].trim();
    const propValue = resolveProperty(note, arg);
    const date = toDate(propValue);

    switch (fnName) {
      case 'dayssince': {
        if (!date) return 0;
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
      case 'daysuntil': {
        if (!date) return 0;
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
      case 'year': {
        if (!date) return 0;
        return date.getFullYear();
      }
      case 'month': {
        if (!date) return 0;
        return date.getMonth() + 1;
      }
      case 'day': {
        if (!date) return 0;
        return date.getDate();
      }
      default:
        return 0;
    }
  }

  // Bare property — return as number
  const value = resolveProperty(note, trimmed);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
}

function resolveProperty(note: NoteData, path: string): unknown {
  if (path === 'file.name') return note.fileName;
  if (path === 'file.path') return note.filePath;
  if (path === 'file.mtime') return note.mtime;
  if (path === 'file.ctime') return note.ctime;
  if (path === 'file.tags' || path === 'tags') return note.tags;

  const key = path.startsWith('note.') ? path.slice(5) : path;
  return note.frontmatter[key] ?? null;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  // Already a Date
  if (value instanceof Date) return value;

  // Timestamp in milliseconds (file.ctime, file.mtime)
  if (typeof value === 'number') {
    if (value > 1e12) return new Date(value);     // ms timestamp
    if (value > 1e9) return new Date(value * 1000); // seconds timestamp
    return null;
  }

  // String date (YYYY-MM-DD, ISO, etc.)
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return new Date(parsed);
  }

  return null;
}
