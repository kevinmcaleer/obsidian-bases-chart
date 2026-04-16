export type ChartType = 'bar' | 'pie' | 'line';
export type AggregateType = 'count' | 'sum' | 'average';

export interface InlineQuery {
  tags?: string[];
  folder?: string;
}

export interface ChartConfig {
  // Data source — reference a .base file, or use an inline query, or both
  source?: string;
  view?: string;
  query?: InlineQuery;

  // Chart
  type: ChartType;

  // Data mapping
  labelProperty: string;
  valueProperty?: string;
  groupBy?: string;
  aggregate?: AggregateType;

  // Appearance
  title?: string;
  colors?: string[];
  width?: number;
  height?: number;
  showGridlines?: boolean;
  showLegend?: boolean;
}

export interface BaseViewConfig {
  type: string;
  name: string;
  filters?: FilterGroup;
  order?: string[];
  sort?: Array<{ property: string; direction: string }>;
  groupBy?: { property: string; direction: string };
  limit?: number;
}

export interface FilterGroup {
  and?: string[];
  or?: string[];
}

export interface ParsedBaseFile {
  filters?: FilterGroup;
  formulas?: Record<string, string>;
  views: BaseViewConfig[];
}

export interface ChartDataResult {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
  }>;
}

export const DEFAULT_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac',
];
