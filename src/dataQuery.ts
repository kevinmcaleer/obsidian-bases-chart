import { App, CachedMetadata } from 'obsidian';
import { ChartConfig, ChartDataResult, InlineQuery, MetricItem, SortField, SortDirection, AggregateType } from './types';
import { parseBaseFile, getViewFilters, buildFilterPredicate, buildConditionPredicate, NoteData } from './baseParser';
import { sqlToConfig } from './sqlEngine';
import { evaluateExpression } from './expressions';

/**
 * Execute a chart config query against the vault and return chart-ready data.
 */
export async function queryChartData(app: App, config: ChartConfig): Promise<ChartDataResult> {
  // If SQL is present, parse it and merge into the config
  if (config.sql) {
    try {
      const sqlParsed = sqlToConfig(config.sql);
      config = { ...config, ...sqlParsed };
    } catch {
      // If SQL parsing fails, fall through to use the other config fields
    }
  }

  // Dispatch to the right query mode
  if (config.metrics && config.metrics.length > 0) {
    return queryMultiMetric(app, config);
  }

  if (config.sources && config.sources.length > 1) {
    return queryMultiSource(app, config);
  }

  if (config.unionSources && config.unionSources.length > 1) {
    return queryUnionSource(app, config);
  }

  return querySingle(app, config);
}

/**
 * Get filtered notes for custom renderers (e.g. calendar heatmap).
 */
export async function queryFilteredNotes(app: App, config: ChartConfig): Promise<NoteData[]> {
  if (config.sql) {
    try {
      const sqlParsed = sqlToConfig(config.sql);
      config = { ...config, ...sqlParsed };
    } catch { /* fall through */ }
  }
  const notes = await loadNotes(app, config.source, config.view);
  return applyInlineFilters(notes, config.query);
}

// ─── Single source query (original behavior) ───

async function querySingle(app: App, config: ChartConfig): Promise<ChartDataResult> {
  const notes = await loadNotes(app, config.source, config.view);
  const filtered = applyInlineFilters(notes, config.query);
  return aggregateData(filtered, config);
}

// ─── Multi-metric query ───
// Each metric is an independent COUNT/SUM/AVG with its own WHERE condition,
// all run against the same base note pool.

async function queryMultiMetric(app: App, config: ChartConfig): Promise<ChartDataResult> {
  // Load the base pool from the first available source
  const source = config.source || config.sources?.[0] || config.unionSources?.[0];
  const notes = await loadNotes(app, source, config.view);
  const filtered = applyInlineFilters(notes, config.query);

  const labels: string[] = [];
  const data: number[] = [];

  for (const metric of config.metrics!) {
    labels.push(metric.label);

    // Apply per-metric WHERE condition
    let metricNotes = filtered;
    if (metric.where) {
      const predicate = buildConditionPredicate(metric.where);
      metricNotes = filtered.filter(predicate);
    }

    // Aggregate
    const value = aggregateMetric(metricNotes, metric);
    data.push(value);
  }

  return {
    labels,
    datasets: [{ label: config.title || 'Metrics', data }],
  };
}

// ─── Multi-source query (separate datasets) ───
// Each source becomes its own dataset, aggregated independently.

async function queryMultiSource(app: App, config: ChartConfig): Promise<ChartDataResult> {
  const allLabels = new Set<string>();
  const sourceData: Array<{ sourceName: string; groups: Map<string, number> }> = [];

  for (const source of config.sources!) {
    const notes = await loadNotes(app, source);
    const filtered = applyInlineFilters(notes, config.query);

    const groups = groupAndAggregate(filtered, config);
    for (const key of groups.keys()) allLabels.add(key);

    // Use source filename without extension as the dataset label
    const label = source.replace(/\.base$/, '');
    sourceData.push({ sourceName: label, groups });
  }

  const labels = Array.from(allLabels).sort();
  const datasets = sourceData.map(sd => ({
    label: sd.sourceName,
    data: labels.map(l => sd.groups.get(l) || 0),
  }));

  return { labels, datasets };
}

// ─── Union source query (merged pool) ───
// Notes from all sources are merged into one pool before aggregating.

async function queryUnionSource(app: App, config: ChartConfig): Promise<ChartDataResult> {
  const allNotes: NoteData[] = [];

  for (const source of config.unionSources!) {
    const notes = await loadNotes(app, source);
    allNotes.push(...notes);
  }

  // Deduplicate by file path
  const seen = new Set<string>();
  const deduped = allNotes.filter(n => {
    if (seen.has(n.filePath)) return false;
    seen.add(n.filePath);
    return true;
  });

  const filtered = applyInlineFilters(deduped, config.query);
  return aggregateData(filtered, config);
}

// ─── Shared helpers ───

async function loadNotes(app: App, source?: string, view?: string): Promise<NoteData[]> {
  let filterFn: (note: NoteData) => boolean = () => true;

  if (source) {
    const base = await parseBaseFile(app, source);
    if (base) {
      const filters = getViewFilters(base, view);
      if (filters.and || filters.or) {
        filterFn = buildFilterPredicate(filters);
      }
    }
  }

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

  return notes.filter(filterFn);
}

function extractTags(cache: CachedMetadata | null, frontmatter: Record<string, unknown>): string[] {
  const tags: string[] = [];

  if (cache?.tags) {
    for (const t of cache.tags) {
      tags.push(t.tag);
    }
  }

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

function applyInlineFilters(notes: NoteData[], query?: InlineQuery): NoteData[] {
  if (!query) return notes;
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

// ─── Date-bucket grouping ───
// Allows synthetic group keys like `file.ctime.month` → "YYYY-MM".
// The SQL equivalent is `GROUP BY month(file.ctime)`.

type DateBucket = 'year' | 'month' | 'day';
const BUCKET_SUFFIXES: Array<{ suffix: string; bucket: DateBucket }> = [
  { suffix: '.year', bucket: 'year' },
  { suffix: '.month', bucket: 'month' },
  { suffix: '.day', bucket: 'day' },
];

function stripBucket(prop: string): { base: string; bucket: DateBucket } | null {
  for (const { suffix, bucket } of BUCKET_SUFFIXES) {
    if (prop.endsWith(suffix) && prop.length > suffix.length) {
      return { base: prop.slice(0, -suffix.length), bucket };
    }
  }
  return null;
}

function coerceDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatBucket(d: Date, bucket: DateBucket): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (bucket === 'year') return String(y);
  if (bucket === 'month') return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

/**
 * Resolve a group key, supporting synthetic date-bucket properties
 * (e.g. `file.ctime.month` → "2026-04").
 */
function resolveGroupKey(note: NoteData, prop: string): string {
  const split = stripBucket(prop);
  if (split) {
    const raw = resolveNoteProperty(note, split.base);
    const d = coerceDate(raw);
    return d ? formatBucket(d, split.bucket) : '(empty)';
  }
  return formatValue(resolveNoteProperty(note, prop));
}

function aggregateMetric(notes: NoteData[], metric: MetricItem): number {
  if (metric.aggregate === 'count') {
    return notes.length;
  }

  if (metric.valueProperty) {
    const vals = notes.map(n => {
      const v = resolveNoteProperty(n, metric.valueProperty!);
      return toNumber(v);
    });

    if (metric.aggregate === 'sum') {
      return vals.reduce((a, b) => a + b, 0);
    }
    if (metric.aggregate === 'average') {
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }

  return notes.length;
}

function groupAndAggregate(notes: NoteData[], config: ChartConfig): Map<string, number> {
  const groups = new Map<string, NoteData[]>();
  const groupProp = config.groupBy || 'file.name';

  for (const note of notes) {
    const key = resolveGroupKey(note, groupProp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(note);
  }

  const aggregate = config.aggregate || 'count';
  const result = new Map<string, number>();

  for (const [key, groupNotes] of groups) {
    if (aggregate === 'count') {
      result.set(key, groupNotes.length);
    } else if (aggregate === 'sum' && config.valueProperty) {
      const sum = groupNotes.reduce((acc, n) => {
        const v = resolveNoteProperty(n, config.valueProperty!);
        return acc + toNumber(v);
      }, 0);
      result.set(key, sum);
    } else if (aggregate === 'average' && config.valueProperty) {
      const vals = groupNotes.map(n => {
        const v = resolveNoteProperty(n, config.valueProperty!);
        return toNumber(v);
      });
      result.set(key, vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    } else {
      result.set(key, groupNotes.length);
    }
  }

  return result;
}

function aggregateData(notes: NoteData[], config: ChartConfig): ChartDataResult {
  const aggregate = config.aggregate || 'count';
  let result: ChartDataResult;

  if (config.groupBy) {
    result = aggregateByGroup(notes, config, aggregate);
  } else {
    result = aggregateFlat(notes, config);
  }

  // Apply sort
  if (config.sort) {
    result = sortResult(result, config.sort.field, config.sort.direction);
  }

  return result;
}

function aggregateByGroup(notes: NoteData[], config: ChartConfig, aggregate: AggregateType): ChartDataResult {
  const groups = new Map<string, NoteData[]>();

  for (const note of notes) {
    const key = resolveGroupKey(note, config.groupBy!);
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
        return acc + toNumber(v);
      }, 0);
      data.push(sum);
    } else if (aggregate === 'average' && config.valueProperty) {
      const vals = groupNotes.map(n => {
        const v = resolveNoteProperty(n, config.valueProperty!);
        return toNumber(v);
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
  const hasExpression = !!config.valueExpression;

  for (const note of notes) {
    const label = formatValue(resolveNoteProperty(note, config.labelProperty));
    labels.push(label);

    if (hasExpression) {
      data.push(evaluateExpression(config.valueExpression!, note));
    } else if (config.valueProperty) {
      const v = resolveNoteProperty(note, config.valueProperty);
      data.push(toNumber(v));
    } else {
      data.push(1);
    }
  }

  const dsLabel = config.title || config.valueExpression || config.valueProperty || 'Count';
  return {
    labels,
    datasets: [{ label: dsLabel, data }],
  };
}

function sortResult(result: ChartDataResult, field: SortField, direction: SortDirection): ChartDataResult {
  const indices = result.labels.map((_, i) => i);

  indices.sort((a, b) => {
    let cmp: number;
    if (field === 'label') {
      cmp = result.labels[a].localeCompare(result.labels[b]);
    } else {
      // Sort by value (first dataset)
      cmp = (result.datasets[0]?.data[a] ?? 0) - (result.datasets[0]?.data[b] ?? 0);
    }
    return direction === 'desc' ? -cmp : cmp;
  });

  return {
    labels: indices.map(i => result.labels[i]),
    datasets: result.datasets.map(ds => ({
      label: ds.label,
      data: indices.map(i => ds.data[i]),
    })),
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '(unknown)';
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
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
