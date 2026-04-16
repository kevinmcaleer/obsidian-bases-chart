import { App, parseYaml } from 'obsidian';
import { ParsedBaseFile, BaseViewConfig, FilterGroup } from './types';

/**
 * Safely convert an arbitrary value to a string for comparison purposes.
 * Arrays are joined, null/undefined become empty string, and plain objects
 * are treated as empty (avoiding '[object Object]' stringification).
 */
function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).join(', ');
  return '';
}

/**
 * Parse a .base file and return its structure.
 */
export async function parseBaseFile(app: App, filename: string): Promise<ParsedBaseFile | null> {
  // Find the .base file in the vault
  const file = app.vault.getFiles().find(
    f => f.extension === 'base' && (f.name === filename || f.path === filename || f.basename === filename.replace(/\.base$/, ''))
  );
  if (!file) return null;

  const content = await app.vault.adapter.read(file.path);
  try {
    const parsed = parseYaml(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      filters: parsed.filters as ParsedBaseFile['filters'] | undefined,
      formulas: parsed.formulas as ParsedBaseFile['formulas'] | undefined,
      views: (parsed.views as ParsedBaseFile['views']) || [],
    };
  } catch {
    return null;
  }
}

/**
 * Get the filter group for a specific view within a parsed base file.
 * Merges top-level filters with view-level filters.
 */
export function getViewFilters(base: ParsedBaseFile, viewName?: string): FilterGroup {
  let view: BaseViewConfig | undefined;
  if (viewName) {
    view = base.views.find(v => v.name === viewName);
  }
  if (!view && base.views.length > 0) {
    view = base.views[0];
  }

  const topFilters = base.filters;
  const viewFilters = view?.filters;

  const safeArray = (arr: unknown): string[] =>
    Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];

  // Merge top-level and view-level filters, keeping and/or semantics separate
  const andConditions = [
    ...safeArray(topFilters?.and),
    ...safeArray(viewFilters?.and),
  ];
  const orConditions = [
    ...safeArray(topFilters?.or),
    ...safeArray(viewFilters?.or),
  ];

  const result: FilterGroup = {};
  if (andConditions.length > 0) result.and = andConditions;
  if (orConditions.length > 0) result.or = orConditions;
  return result;
}

/**
 * Get the list of property names referenced in a view's "order" field.
 * These represent the columns the user cares about.
 */
export function getViewProperties(base: ParsedBaseFile, viewName?: string): string[] {
  let view: BaseViewConfig | undefined;
  if (viewName) {
    view = base.views.find(v => v.name === viewName);
  }
  if (!view && base.views.length > 0) {
    view = base.views[0];
  }
  return view?.order || [];
}

/**
 * List all view names in a base file.
 */
export function getViewNames(base: ParsedBaseFile): string[] {
  return base.views.map(v => v.name);
}

/**
 * Build a predicate function from Bases filter expressions.
 * Each expression is a string like:
 *   tags.contains("project")
 *   !status.containsAny("✅ Done", "done")
 *   file.tags.containsAny("todo", "task")
 *   !Projects.isEmpty()
 */
export type NoteData = {
  filePath: string;
  fileName: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  ctime: number;
  mtime: number;
};

export function buildFilterPredicate(filters: FilterGroup): (note: NoteData) => boolean {
  const toStrings = (arr: unknown[]): string[] =>
    arr.filter((v): v is string => typeof v === 'string');

  const andPredicates = toStrings(filters.and || []).map(parseExpression);
  const orPredicates = toStrings(filters.or || []).map(parseExpression);

  return (note: NoteData) => {
    const andPass = andPredicates.length === 0 || andPredicates.every(fn => fn(note));
    const orPass = orPredicates.length === 0 || orPredicates.some(fn => fn(note));
    return andPass && orPass;
  };
}

function parseExpression(expr: string): (note: NoteData) => boolean {
  const trimmed = expr.trim();

  // Handle negation
  const negated = trimmed.startsWith('!');
  const inner = negated ? trimmed.slice(1) : trimmed;

  const predicate = parseSingleExpression(inner);
  return negated ? (note: NoteData) => !predicate(note) : predicate;
}

function parseSingleExpression(expr: string): (note: NoteData) => boolean {
  // Match: property.method("args")
  const methodMatch = expr.match(/^(.+?)\.(contains|containsAny|isEmpty|hasTag)\(([^)]*)\)$/);
  if (methodMatch) {
    const [, propertyPath, method, argsStr] = methodMatch;
    const args = parseArgs(argsStr);

    return (note: NoteData) => {
      const value = resolveProperty(note, propertyPath);

      switch (method) {
        case 'contains':
          return valueContains(value, args[0]);
        case 'containsAny':
          return args.some(arg => valueContains(value, arg));
        case 'hasTag':
          return args.some(arg => note.tags.some(t => t.toLowerCase() === arg.toLowerCase() || t.toLowerCase() === `#${arg.toLowerCase()}`));
        case 'isEmpty':
          return value === null || value === undefined || value === '' ||
            (Array.isArray(value) && value.length === 0);
        default:
          return true;
      }
    };
  }

  // Fallback: always pass
  return () => true;
}

function parseArgs(argsStr: string): string[] {
  const args: string[] = [];
  const regex = /"([^"]*?)"|'([^']*?)'/g;
  let match;
  while ((match = regex.exec(argsStr)) !== null) {
    args.push(match[1] ?? match[2]);
  }
  return args;
}

function resolveProperty(note: NoteData, path: string): unknown {
  // Handle file.* properties
  if (path === 'file.name') return note.fileName;
  if (path === 'file.tags' || path === 'tags') return note.tags;
  if (path === 'file.mtime') return note.mtime;
  if (path === 'file.ctime') return note.ctime;
  if (path === 'file.path') return note.filePath;

  // Handle note.* prefix (strip it)
  const key = path.startsWith('note.') ? path.slice(5) : path;

  // Look up in frontmatter
  return note.frontmatter[key] ?? note.frontmatter[key.toLowerCase()] ?? null;
}

/**
 * Build a predicate from a SQL-style WHERE condition string.
 * Supports: IS EMPTY, IS NOT EMPTY, = 'val', != 'val', CONTAINS 'val', > N, < N
 */
export function buildConditionPredicate(condition: string): (note: NoteData) => boolean {
  const trimmed = condition.trim();
  if (!trimmed) return () => true;

  // prop IS NOT EMPTY
  const isNotEmptyMatch = trimmed.match(/^(.+?)\s+IS\s+NOT\s+EMPTY$/i);
  if (isNotEmptyMatch) {
    const prop = isNotEmptyMatch[1].trim();
    return (note) => {
      const val = resolveProperty(note, prop);
      return val !== null && val !== undefined && val !== '' &&
        !(Array.isArray(val) && val.length === 0);
    };
  }

  // prop IS EMPTY
  const isEmptyMatch = trimmed.match(/^(.+?)\s+IS\s+EMPTY$/i);
  if (isEmptyMatch) {
    const prop = isEmptyMatch[1].trim();
    return (note) => {
      const val = resolveProperty(note, prop);
      return val === null || val === undefined || val === '' ||
        (Array.isArray(val) && val.length === 0);
    };
  }

  // prop CONTAINS 'val'
  const containsMatch = trimmed.match(/^(.+?)\s+CONTAINS\s+'([^']*)'/i);
  if (containsMatch) {
    const prop = containsMatch[1].trim();
    const search = containsMatch[2];
    return (note) => valueContains(resolveProperty(note, prop), search);
  }

  // prop != 'val'
  const neqMatch = trimmed.match(/^(.+?)\s*!=\s*'([^']*)'/);
  if (neqMatch) {
    const prop = neqMatch[1].trim();
    const val = neqMatch[2];
    return (note) => {
      const v = resolveProperty(note, prop);
      return stringifyValue(v).toLowerCase() !== val.toLowerCase();
    };
  }

  // prop = 'val'
  const eqMatch = trimmed.match(/^(.+?)\s*=\s*'([^']*)'/);
  if (eqMatch) {
    const prop = eqMatch[1].trim();
    const val = eqMatch[2];
    return (note) => {
      const v = resolveProperty(note, prop);
      return stringifyValue(v).toLowerCase() === val.toLowerCase();
    };
  }

  // prop > N
  const gtMatch = trimmed.match(/^(.+?)\s*>\s*([0-9.]+)/);
  if (gtMatch) {
    const prop = gtMatch[1].trim();
    const num = parseFloat(gtMatch[2]);
    return (note) => {
      const v = resolveProperty(note, prop);
      return (typeof v === 'number' ? v : parseFloat(stringifyValue(v)) || 0) > num;
    };
  }

  // prop < N
  const ltMatch = trimmed.match(/^(.+?)\s*<\s*([0-9.]+)/);
  if (ltMatch) {
    const prop = ltMatch[1].trim();
    const num = parseFloat(ltMatch[2]);
    return (note) => {
      const v = resolveProperty(note, prop);
      return (typeof v === 'number' ? v : parseFloat(stringifyValue(v)) || 0) < num;
    };
  }

  // Fallback: always pass
  return () => true;
}

function valueContains(value: unknown, search: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    return value.toLowerCase().includes(search.toLowerCase());
  }
  if (Array.isArray(value)) {
    return value.some(v =>
      typeof v === 'string' && v.toLowerCase().includes(search.toLowerCase())
    );
  }
  return String(value).toLowerCase().includes(search.toLowerCase());
}
