import { Chart, ChartConfiguration, ChartType as ChartJsType, registerables } from 'chart.js';
import type { Context as DataLabelsContext } from 'chartjs-plugin-datalabels';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { ChartConfig, ChartDataResult, DEFAULT_COLORS, DataLabelPosition } from './types';

Chart.register(...registerables, ChartDataLabels);

/**
 * Theme-sensitive colours resolved from the container's computed styles.
 * Chart.js paints into a <canvas>, so CSS custom properties like
 * `var(--text-muted)` do NOT resolve — they silently fall back to black.
 * We must read the actual values and pass them as plain colour strings.
 */
export interface ThemeColors {
  textNormal: string;
  textMuted: string;
  border: string;
}

export function readThemeColors(container: HTMLElement): ThemeColors {
  const style = getComputedStyle(container);
  const get = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    textNormal: get('--text-normal', '#222222'),
    textMuted: get('--text-muted', '#888888'),
    border: get('--background-modifier-border', '#cccccc'),
  };
}

/**
 * Patch a live chart's theme-sensitive colours and redraw. Called when
 * the theme flips between light and dark.
 */
export function applyThemeColors(chart: Chart, theme: ThemeColors, showGridlines: boolean): void {
  const opts = chart.options;
  const gridColor = showGridlines ? theme.border : 'transparent';

  if (opts.plugins?.legend?.labels) {
    opts.plugins.legend.labels.color = theme.textMuted;
  }

  const scales = opts.scales as Record<string, { ticks?: { color?: string }; grid?: { color?: string } }> | undefined;
  if (scales) {
    for (const axis of Object.values(scales)) {
      if (axis.ticks) axis.ticks.color = theme.textMuted;
      if (axis.grid) axis.grid.color = gridColor;
    }
  }

  // Data-labels "outside" position uses theme text colour
  const dl = (opts.plugins as Record<string, { color?: string } | undefined> | undefined)?.datalabels;
  if (dl && typeof dl.color === 'string' && dl.color !== '#fff' && dl.color !== '#ffffff') {
    // Outside labels: update to theme-aware colour. We can't tell here
    // whether they should be textNormal (pies) or textMuted (bars), so
    // use textNormal for maximum readability.
    dl.color = theme.textNormal;
  }

  chart.update('none');
}

export function renderChart(
  container: HTMLElement,
  data: ChartDataResult,
  config: ChartConfig
): Chart {
  const canvas = container.createEl('canvas');
  const width = config.width || 600;
  const height = config.height || 400;
  canvas.width = width;
  canvas.height = height;
  canvas.addClass('bases-chart-canvas');

  const colors = config.colors && config.colors.length > 0
    ? config.colors
    : DEFAULT_COLORS;
  const theme = readThemeColors(container);

  if (config.type === 'gauge') {
    return buildGauge(canvas, data, colors, config, theme);
  }

  const chartConfig = buildChartConfig(config, data, colors, theme);
  return new Chart(canvas, chartConfig);
}

function buildChartConfig(
  config: ChartConfig,
  data: ChartDataResult,
  colors: string[],
  theme: ThemeColors,
): ChartConfiguration {
  const type = config.type;
  const isColumn = type === 'column';
  const isPieOrDoughnut = type === 'pie' || type === 'doughnut';
  const isLine = type === 'line';
  const showGridlines = config.showGridlines !== false;
  const showLegend = config.showLegend !== undefined ? config.showLegend : (isPieOrDoughnut || data.datasets.length > 1);
  const dataLabels = config.dataLabels || 'none';
  const isMultiDataset = data.datasets.length > 1;

  const datasets = data.datasets.map((ds, i) => {
    if (isPieOrDoughnut) {
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: data.labels.map((_, j) => colors[j % colors.length]),
        borderColor: data.labels.map((_, j) => colors[j % colors.length]),
        borderWidth: 1,
      };
    }

    if (isLine) {
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: colors[i % colors.length] + '33',
        borderColor: colors[i % colors.length],
        borderWidth: 2,
        fill: false,
        tension: 0.3,
      };
    }

    if (isMultiDataset) {
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: colors[i % colors.length] + 'cc',
        borderColor: 'transparent',
        borderWidth: 0,
        borderRadius: 4,
      };
    }

    return {
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.data.map((_, j) => colors[j % colors.length] + 'cc'),
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 4,
    };
  });

  const gridColor = showGridlines ? theme.border : 'transparent';
  const datalabelsConfig = buildDataLabelsConfig(dataLabels, isPieOrDoughnut, theme);

  const chartjsType: ChartJsType = isColumn ? 'bar' : (type as ChartJsType);

  return {
    type: chartjsType,
    data: {
      labels: data.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isColumn ? 'y' : undefined,
      layout: isPieOrDoughnut && dataLabels === 'outside' ? {
        padding: { top: 30, bottom: 30, left: 30, right: 30 },
      } : undefined,
      plugins: {
        title: { display: false },
        legend: {
          display: showLegend,
          labels: { color: theme.textMuted },
        },
        tooltip: { enabled: true },
        datalabels: datalabelsConfig,
      },
      scales: isPieOrDoughnut ? {} : {
        x: {
          ticks: { color: theme.textMuted },
          grid: { color: gridColor, drawTicks: showGridlines },
          beginAtZero: isColumn ? true : undefined,
        },
        y: {
          ticks: { color: theme.textMuted },
          grid: { color: gridColor, drawTicks: showGridlines },
          beginAtZero: !isColumn ? true : undefined,
        },
      },
    },
  };
}

// ─── Gauge chart (half-doughnut) ───

function buildGauge(
  canvas: HTMLCanvasElement,
  data: ChartDataResult,
  colors: string[],
  config: ChartConfig,
  theme: ThemeColors,
): Chart {
  const dataLabels = config.dataLabels || 'none';

  const visibleData = data.datasets[0]?.data || [];
  const total = visibleData.reduce((a, b) => a + b, 0);

  const bgColors = visibleData.map((_, j) => colors[j % colors.length]);
  const borderColors = [...bgColors];

  const gaugeData = [...visibleData, total];
  bgColors.push('transparent');
  borderColors.push('transparent');

  const showLegend = config.showLegend !== undefined ? config.showLegend : true;

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [...(data.labels || []), ''],
      datasets: [{
        data: gaugeData,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: '60%',
      layout: {
        padding: { bottom: 0 },
      },
      plugins: {
        title: { display: false },
        legend: {
          display: showLegend,
          labels: {
            color: theme.textMuted,
            filter: (item: { index?: number }) => {
              return (item.index ?? 0) < visibleData.length;
            },
          },
        },
        tooltip: {
          filter: (item: { dataIndex: number }) => {
            return item.dataIndex < visibleData.length;
          },
        },
        datalabels: buildGaugeDataLabels(dataLabels, visibleData.length, theme),
      },
    },
  });
}

function buildGaugeDataLabels(position: DataLabelPosition, visibleCount: number, theme: ThemeColors): Record<string, unknown> {
  if (position === 'none') {
    return { display: false };
  }

  return {
    display: (ctx: DataLabelsContext) => ctx.dataIndex < visibleCount,
    color: position === 'outside' ? theme.textNormal : '#fff',
    font: { size: 12, weight: 'bold' },
    anchor: position === 'outside' ? 'end' : 'center',
    align: position === 'outside' ? 'end' : 'center',
    offset: position === 'outside' ? 8 : 0,
    formatter: (value: number, ctx: DataLabelsContext) => {
      if (ctx.dataIndex >= visibleCount) return '';
      const dataArr = (ctx.dataset.data as number[]).slice(0, visibleCount);
      const visibleTotal = dataArr.reduce((a, b) => a + b, 0);
      const pct = visibleTotal > 0 ? Math.round((value / visibleTotal) * 100) : 0;
      if (position === 'outside') {
        const label = ctx.chart.data.labels?.[ctx.dataIndex];
        const labelText = typeof label === 'string' ? label : '';
        return `${labelText}\n${pct}%`;
      }
      return pct >= 5 ? `${pct}%` : '';
    },
    textAlign: 'center',
  };
}

// ─── Data labels config ───

function buildDataLabelsConfig(position: DataLabelPosition, isPie: boolean, theme: ThemeColors): Record<string, unknown> {
  if (position === 'none') {
    return { display: false };
  }

  if (isPie) {
    if (position === 'outside') {
      return {
        display: true,
        color: theme.textNormal,
        font: { size: 12, weight: 'bold' },
        anchor: 'end', align: 'end', offset: 10,
        formatter: (value: number, ctx: DataLabelsContext) => {
          const label = ctx.chart.data.labels?.[ctx.dataIndex];
          const labelText = typeof label === 'string' ? label : '';
          const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return `${labelText}\n${pct}%`;
        },
        textAlign: 'center',
      };
    }
    return {
      display: true, color: '#fff',
      font: { size: 12, weight: 'bold' },
      anchor: 'center', align: 'center',
      formatter: (value: number, ctx: DataLabelsContext) => {
        const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return pct >= 5 ? `${pct}%` : '';
      },
    };
  }

  switch (position) {
    case 'base':
      return {
        display: true, color: '#fff',
        font: { size: 11, weight: 'bold' },
        anchor: 'start', align: 'start', offset: 4,
        formatter: (value: number) => value > 0 ? String(value) : '',
      };
    case 'top':
      return {
        display: true, color: '#fff',
        font: { size: 11, weight: 'bold' },
        anchor: 'end', align: 'start', offset: 4,
        formatter: (value: number) => value > 0 ? String(value) : '',
      };
    case 'outside':
      return {
        display: true, color: theme.textNormal,
        font: { size: 11, weight: 'bold' },
        anchor: 'end', align: 'end', offset: 4,
        formatter: (value: number) => value > 0 ? String(value) : '',
      };
    default:
      return { display: false };
  }
}

export function destroyChart(chart: Chart | null): void {
  if (chart) {
    chart.destroy();
  }
}
