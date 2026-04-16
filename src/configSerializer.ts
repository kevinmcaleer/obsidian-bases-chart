import { parseYaml, stringifyYaml } from 'obsidian';
import { ChartConfig, SortField, SortDirection } from './types';

/**
 * Parse YAML config from a code block.
 * Reads all fields for backwards compatibility with old configs that used
 * individual data fields instead of sql.
 */
export function parseChartConfig(source: string): ChartConfig | null {
  try {
    const raw = parseYaml(source) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;

    const config: ChartConfig = {
      type: (raw.type as ChartConfig['type']) || 'bar',
      labelProperty: (raw.labelProperty as string) || 'file.name',
    };

    // Data fields (legacy — kept for backwards compat, sql is now preferred)
    if (typeof raw.source === 'string') config.source = raw.source;
    if (typeof raw.view === 'string') config.view = raw.view;
    if (raw.query && typeof raw.query === 'object') config.query = raw.query as ChartConfig['query'];
    if (typeof raw.valueProperty === 'string') config.valueProperty = raw.valueProperty;
    if (typeof raw.groupBy === 'string') config.groupBy = raw.groupBy;
    if (typeof raw.aggregate === 'string') config.aggregate = raw.aggregate as ChartConfig['aggregate'];
    if (Array.isArray(raw.metrics)) config.metrics = raw.metrics as ChartConfig['metrics'];
    if (Array.isArray(raw.sources)) config.sources = raw.sources as string[];
    if (Array.isArray(raw.unionSources)) config.unionSources = raw.unionSources as string[];
    if (typeof raw.valueExpression === 'string') config.valueExpression = raw.valueExpression;
    if (raw.sort !== undefined) {
      if (typeof raw.sort === 'string') {
        const parts = raw.sort.trim().split(/\s+/);
        const field: SortField = parts[0] === 'label' ? 'label' : 'value';
        const direction: SortDirection = parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc';
        config.sort = { field, direction };
      } else if (typeof raw.sort === 'object' && raw.sort !== null) {
        config.sort = raw.sort as ChartConfig['sort'];
      }
    }

    // SQL (source of truth for data)
    if (typeof raw.sql === 'string') config.sql = raw.sql;

    // Appearance
    if (typeof raw.title === 'string') config.title = raw.title;
    if (Array.isArray(raw.colors)) config.colors = raw.colors as string[];
    if (typeof raw.width === 'number') config.width = raw.width;
    if (typeof raw.height === 'number') config.height = raw.height;
    if (typeof raw.fontSize === 'number') config.fontSize = raw.fontSize;
    if (typeof raw.fontColor === 'string') config.fontColor = raw.fontColor;
    if (raw.showGridlines !== undefined) config.showGridlines = Boolean(raw.showGridlines);
    if (raw.showLegend !== undefined) config.showLegend = Boolean(raw.showLegend);
    if (typeof raw.dataLabels === 'string') config.dataLabels = raw.dataLabels as ChartConfig['dataLabels'];

    return config;
  } catch {
    return null;
  }
}

/**
 * Serialize config to YAML.
 * Only writes appearance + sql. Data fields are not written —
 * they live inside the sql string.
 */
export function serializeChartConfig(config: ChartConfig): string {
  const obj: Record<string, unknown> = {};

  // Appearance
  obj.type = config.type;
  if (config.title) obj.title = config.title;
  if (config.colors && config.colors.length > 0) obj.colors = config.colors;
  if (config.width) obj.width = config.width;
  if (config.height) obj.height = config.height;
  if (config.fontSize) obj.fontSize = config.fontSize;
  if (config.fontColor) obj.fontColor = config.fontColor;
  if (config.showGridlines !== undefined) obj.showGridlines = config.showGridlines;
  if (config.showLegend !== undefined) obj.showLegend = config.showLegend;
  if (config.dataLabels && config.dataLabels !== 'none') obj.dataLabels = config.dataLabels;

  // SQL (single source of truth for data)
  if (config.sql) obj.sql = config.sql;

  return stringifyYaml(obj).trimEnd();
}
