import { App, parseYaml, TFile } from 'obsidian';
import { ParsedBaseFile, BaseViewConfig, FilterGroup } from './types';

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
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      filters: parsed.filters || undefined,
      formulas: parsed.formulas || undefined,
      views: parsed.views || [],
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

  // Merge: combine all "and" conditions from top-level and view-level
  const andConditions: string[] = [];
  if (topFilters?.and) andConditions.push(...topFilters.and);
  if (topFilters?.or) andConditions.push(...topFilters.or); // treat top-level or as additional conditions
  if (viewFilters?.and) andConditions.push(...viewFilters.and);

  const orConditions: string[] = [];
  if (viewFilters?.or) orConditions.push(...viewFilters.or);

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
  const andPredicates = (filters.and || []).map(parseExpression);
  const orPredicates = (filters.or || []).map(parseExpression);

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
