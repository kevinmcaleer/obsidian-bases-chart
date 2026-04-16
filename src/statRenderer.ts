import { ChartConfig, ChartDataResult } from './types';

/**
 * Render a single-number "stat" chart.
 * Takes the first value of the first dataset — works naturally with a
 * multi-metric query like `SELECT COUNT(*) AS "Today" WHERE ... FROM notes`.
 *
 * If the result has multiple rows (e.g. a bare `SELECT COUNT(*) FROM notes`
 * with no groupBy, which produces one row per note each with value 1), we
 * fall back to summing the dataset so the number is still meaningful.
 */
export function renderStat(
  container: HTMLElement,
  data: ChartDataResult,
  config: ChartConfig,
): void {
  const ds = data.datasets[0];
  const values = ds?.data ?? [];

  let value: number;
  if (values.length <= 1) {
    value = values[0] ?? 0;
  } else {
    value = values.reduce((a, b) => a + b, 0);
  }

  const fontSize = config.fontSize && config.fontSize > 0 ? config.fontSize : 72;
  const fontColor = config.fontColor || 'var(--text-normal)';

  const stat = container.createDiv({ cls: 'bases-chart-stat' });
  stat.setCssProps({
    '--bases-chart-stat-font-size': `${fontSize}px`,
    '--bases-chart-stat-color': fontColor,
  });

  const numberEl = stat.createDiv({ cls: 'bases-chart-stat-value' });
  numberEl.textContent = formatNumber(value);

  // Optional caption below the number: the dataset label (e.g. the metric
  // label from `AS "Today"`). Only shown when there's a single value and
  // the label is something meaningful (not a generic fallback).
  if (values.length === 1 && ds?.label && !isGenericLabel(ds.label)) {
    stat.createDiv({ cls: 'bases-chart-stat-caption', text: ds.label });
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  if (Number.isInteger(n)) return n.toLocaleString();
  // Trim trailing zeros for decimals
  return parseFloat(n.toFixed(2)).toLocaleString();
}

function isGenericLabel(label: string): boolean {
  const l = label.toLowerCase();
  return l === 'count' || l === 'value' || l === 'metrics';
}
