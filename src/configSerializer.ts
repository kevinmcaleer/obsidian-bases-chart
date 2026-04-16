import { parseYaml, stringifyYaml } from 'obsidian';
import { ChartConfig } from './types';

export function parseChartConfig(source: string): ChartConfig | null {
  try {
    const raw = parseYaml(source);
    if (!raw || typeof raw !== 'object') return null;

    const config: ChartConfig = {
      type: raw.type || 'bar',
      labelProperty: raw.labelProperty || 'file.name',
    };

    if (raw.source) config.source = raw.source;
    if (raw.view) config.view = raw.view;
    if (raw.query) config.query = raw.query;
    if (raw.valueProperty) config.valueProperty = raw.valueProperty;
    if (raw.groupBy) config.groupBy = raw.groupBy;
    if (raw.aggregate) config.aggregate = raw.aggregate;
    if (raw.title) config.title = raw.title;
    if (raw.colors) config.colors = raw.colors;
    if (raw.width) config.width = raw.width;
    if (raw.height) config.height = raw.height;
    if (raw.showGridlines !== undefined) config.showGridlines = raw.showGridlines;
    if (raw.showLegend !== undefined) config.showLegend = raw.showLegend;

    return config;
  } catch {
    return null;
  }
}

export function serializeChartConfig(config: ChartConfig): string {
  // Build a clean object with only defined fields, in a readable order
  const obj: Record<string, unknown> = {};

  if (config.source) obj.source = config.source;
  if (config.view) obj.view = config.view;
  if (config.query) obj.query = config.query;
  obj.type = config.type;
  obj.labelProperty = config.labelProperty;
  if (config.valueProperty) obj.valueProperty = config.valueProperty;
  if (config.groupBy) obj.groupBy = config.groupBy;
  if (config.aggregate) obj.aggregate = config.aggregate;
  if (config.title) obj.title = config.title;
  if (config.colors && config.colors.length > 0) obj.colors = config.colors;
  if (config.width) obj.width = config.width;
  if (config.height) obj.height = config.height;
  if (config.showGridlines !== undefined) obj.showGridlines = config.showGridlines;
  if (config.showLegend !== undefined) obj.showLegend = config.showLegend;

  return stringifyYaml(obj).trimEnd();
}
