import { App, TFile } from 'obsidian';
import { ChartConfig, ChartDataResult, InlineQuery, FilterGroup } from './types';
import { parseBaseFile, getViewFilters, buildFilterPredicate, NoteData } from './baseParser';

/**
 * Execute a chart config query against the vault and return chart-ready data.
 */
export async function queryChartData(app: App, config: ChartConfig): Promise<ChartDataResult> {
  // Step 1: Build the filter predicate
  let filterFn: (note: NoteData) => boolean = () => true;

  if (config.source) {
    const base = await parseBaseFile(app, config.source);
    if (base) {
      const filters = getViewFilters(base, config.view);
      if (filters.and || filters.or) {
        filterFn = buildFilterPredicate(filters);
      }
    }
  }

  // Step 2: Gather all markdown files and their metadata
  const files = app.vault.getMarkdownFiles();
  const notes: NoteData[] = [];

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter || {};
    const tags = extractTags(cache, frontmatter);

    notes.push({
      filePath: file.path,
      fileName: file.basename,
      frontmatter,
      tags,
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
    });
  }

  // Step 3: Apply base file filters
  let filtered = notes.filter(filterFn);

  // Step 4: Apply inline query filters on top
  if (config.query) {
    filtered = applyInlineQuery(filtered, config.query);
  }

  // Step 5: Aggregate and build chart data
  return aggregateData(filtered, config);
}

function extractTags(cache: ReturnType<App['metadataCache']['getFileCache']>, frontmatter: Record<string, unknown>): string[] {
  const tags: string[] = [];

  // Tags from cache
  if (cache?.tags) {
    for (const t of cache.tags) {
      tags.push(t.tag);
    }
  }

  // Tags from frontmatter
  const fmTags = frontmatter.tags;
  if (Array.isArray(fmTags)) {
    for (const t of fmTags) {
      if (typeof t === 'string') {
        tags.push(t.startsWith('#') ? t : `#${t}`);
      }
    }
  } else if (typeof fmTags === 'string') {
    tags.push(fmTags.startsWith('#') ? fmTags : `#${fmTags}`);
  }

  return tags;
}

function applyInlineQuery(notes: NoteData[], query: InlineQuery): NoteData[] {
  let result = notes;

  if (query.tags && query.tags.length > 0) {
    result = result.filter(note =>
      query.tags!.every(tag =>
        note.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
      )
    );
  }

  if (query.folder) {
    const folder = query.folder.replace(/^\/|\/$/g, '');
    result = result.filter(note => note.filePath.startsWith(folder + '/'));
  }

  return result;
}

function resolveNoteProperty(note: NoteData, prop: string): unknown {
  if (prop === 'file.name') return note.fileName;
  if (prop === 'file.path') return note.filePath;
  if (prop === 'file.mtime') return note.mtime;
  if (prop === 'file.ctime') return note.ctime;
  if (prop === 'file.tags' || prop === 'tags') return note.tags;

  const key = prop.startsWith('note.') ? prop.slice(5) : prop;
  return note.frontmatter[key] ?? null;
}

function aggregateData(notes: NoteData[], config: ChartConfig): ChartDataResult {
  const aggregate = config.aggregate || 'count';

  if (config.groupBy) {
    return aggregateByGroup(notes, config, aggregate);
  }

  // No groupBy: each note is a data point
  return aggregateFlat(notes, config);
}

function aggregateByGroup(notes: NoteData[], config: ChartConfig, aggregate: string): ChartDataResult {
  const groups = new Map<string, NoteData[]>();

  for (const note of notes) {
    const groupVal = resolveNoteProperty(note, config.groupBy!);
    const key = formatValue(groupVal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(note);
  }

  const labels = Array.from(groups.keys());
  const data: number[] = [];

  for (const [, groupNotes] of groups) {
    if (aggregate === 'count') {
      data.push(groupNotes.length);
    } else if (aggregate === 'sum' && config.valueProperty) {
      const sum = groupNotes.reduce((acc, n) => {
        const v = resolveNoteProperty(n, config.valueProperty!);
        return acc + (typeof v === 'number' ? v : parseFloat(String(v)) || 0);
      }, 0);
      data.push(sum);
    } else if (aggregate === 'average' && config.valueProperty) {
      const vals = groupNotes.map(n => {
        const v = resolveNoteProperty(n, config.valueProperty!);
        return typeof v === 'number' ? v : parseFloat(String(v)) || 0;
      });
      data.push(vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    } else {
      data.push(groupNotes.length);
    }
  }

  return {
    labels,
    datasets: [{ label: config.title || config.groupBy || 'Value', data }],
  };
}

function aggregateFlat(notes: NoteData[], config: ChartConfig): ChartDataResult {
  const labels: string[] = [];
  const data: number[] = [];

  for (const note of notes) {
    const label = formatValue(resolveNoteProperty(note, config.labelProperty));
    labels.push(label);

    if (config.valueProperty) {
      const v = resolveNoteProperty(note, config.valueProperty);
      data.push(typeof v === 'number' ? v : parseFloat(String(v)) || 0);
    } else {
      data.push(1);
    }
  }

  return {
    labels,
    datasets: [{ label: config.title || config.valueProperty || 'Count', data }],
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

/**
 * Discover all .base files in the vault.
 */
export function listBaseFiles(app: App): string[] {
  return app.vault.getFiles()
    .filter(f => f.extension === 'base')
    .map(f => f.name)
    .sort();
}

/**
 * Discover all frontmatter property keys used across the vault.
 */
export function discoverProperties(app: App): string[] {
  const props = new Set<string>();
  props.add('file.name');
  props.add('file.path');
  props.add('file.ctime');
  props.add('file.mtime');
  props.add('file.tags');

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.frontmatter) {
      for (const key of Object.keys(cache.frontmatter)) {
        if (key !== 'position') {
          props.add(key);
        }
      }
    }
  }

  return Array.from(props).sort();
}
