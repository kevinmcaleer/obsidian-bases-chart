import { parseYaml, stringifyYaml } from 'obsidian';
import { ChartConfig } from './types';

/**
 * Parse YAML config from a code block.
 * Reads all fields for backwards compatibility with old configs that used
 * individual data fields instead of sql.
 */
export function parseChartConfig(source: string): ChartConfig | null {
  try {
    const raw = parseYaml(source);
    if (!raw || typeof raw !== 'object') return null;

    const config: ChartConfig = {
      type: raw.type || 'bar',
      labelProperty: raw.labelProperty || 'file.name',
    };

    // Data fields (legacy — kept for backwards compat, sql is now preferred)
    if (raw.source) config.source = raw.source;
    if (raw.view) config.view = raw.view;
    if (raw.query) config.query = raw.query;
    if (raw.valueProperty) config.valueProperty = raw.valueProperty;
    if (raw.groupBy) config.groupBy = raw.groupBy;
    if (raw.aggregate) config.aggregate = raw.aggregate;
    if (raw.metrics) config.metrics = raw.metrics;
    if (raw.sources) config.sources = raw.sources;
    if (raw.unionSources) config.unionSources = raw.unionSources;
    if (raw.valueExpression) config.valueExpression = raw.valueExpression;
    if (raw.sort) {
      if (typeof raw.sort === 'string') {
        const parts = raw.sort.trim().split(/\s+/);
        config.sort = {
          field: (parts[0] === 'label' ? 'label' : 'value') as any,
          direction: (parts[1]?.toLowerCase() === 'desc' ? 'desc' : 'asc') as any,
        };
      } else if (typeof raw.sort === 'object') {
        config.sort = raw.sort;
      }
    }

    // SQL (source of truth for data)
    if (raw.sql) config.sql = raw.sql;

    // Appearance
    if (raw.title) config.title = raw.title;
    if (raw.colors) config.colors = raw.colors;
    if (raw.width) config.width = raw.width;
    if (raw.height) config.height = raw.height;
    if (raw.showGridlines !== undefined) config.showGridlines = raw.showGridlines;
    if (raw.showLegend !== undefined) config.showLegend = raw.showLegend;
    if (raw.dataLabels) config.dataLabels = raw.dataLabels;

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
  if (config.showGridlines !== undefined) obj.showGridlines = config.showGridlines;
  if (config.showLegend !== undefined) obj.showLegend = config.showLegend;
  if (config.dataLabels && config.dataLabels !== 'none') obj.dataLabels = config.dataLabels;

  // SQL (single source of truth for data)
  if (config.sql) obj.sql = config.sql;

  return stringifyYaml(obj).trimEnd();
}
