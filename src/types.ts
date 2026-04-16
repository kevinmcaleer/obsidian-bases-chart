export type ChartType = 'bar' | 'column' | 'pie' | 'doughnut' | 'gauge' | 'line' | 'calendar' | 'stat';
export type DataLabelPosition = 'none' | 'base' | 'top' | 'outside';
export type AggregateType = 'count' | 'sum' | 'average';
export type SortDirection = 'asc' | 'desc';
export type SortField = 'value' | 'label';

export interface MetricItem {
  aggregate: AggregateType;
  valueProperty?: string;
  where?: string;
  label: string;
}

export interface InlineQuery {
  tags?: string[];
  folder?: string;
}

export interface ChartConfig {
  // ── Appearance (persisted to YAML) ──
  type: ChartType;
  sql?: string;
  title?: string;
  colors?: string[];
  width?: number;
  height?: number;
  fontSize?: number;      // Stat chart: font size in pixels (default 72)
  fontColor?: string;     // Stat chart: text colour (hex, default theme text)
  showGridlines?: boolean;
  showLegend?: boolean;
  dataLabels?: DataLabelPosition;

  // ── Data fields (populated from SQL at runtime, or from legacy YAML) ──
  source?: string;
  view?: string;
  query?: InlineQuery;
  labelProperty: string;
  valueProperty?: string;
  groupBy?: string;
  aggregate?: AggregateType;
  metrics?: MetricItem[];
  sources?: string[];
  unionSources?: string[];
  valueExpression?: string;
  sort?: { field: SortField; direction: SortDirection };
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
  and?: unknown[];
  or?: unknown[];
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
