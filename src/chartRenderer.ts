import { Chart, ChartConfiguration, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { ChartConfig, ChartDataResult, DEFAULT_COLORS, DataLabelPosition } from './types';

Chart.register(...registerables, ChartDataLabels);

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
  canvas.style.maxWidth = '100%';

  const colors = config.colors && config.colors.length > 0
    ? config.colors
    : DEFAULT_COLORS;

  if (config.type === 'gauge') {
    return buildGauge(canvas, data, colors, config);
  }

  const chartConfig = buildChartConfig(config, data, colors);
  return new Chart(canvas, chartConfig);
}

function buildChartConfig(
  config: ChartConfig,
  data: ChartDataResult,
  colors: string[],
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

    // Bar or column
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

  const gridColor = showGridlines ? 'var(--background-modifier-border)' : 'transparent';
  const datalabelsConfig = buildDataLabelsConfig(dataLabels, isPieOrDoughnut, colors);

  const chartjsType = (isColumn ? 'bar' : (type === 'doughnut' ? 'doughnut' : type)) as any;

  return {
    type: chartjsType,
    data: {
      labels: data.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isColumn ? 'y' as const : undefined,
      layout: isPieOrDoughnut && dataLabels === 'outside' ? {
        padding: { top: 30, bottom: 30, left: 30, right: 30 },
      } : undefined,
      plugins: {
        title: { display: false },
        legend: {
          display: showLegend,
          labels: { color: 'var(--text-muted)' },
        },
        tooltip: { enabled: true },
        datalabels: datalabelsConfig,
      },
      scales: isPieOrDoughnut ? {} : {
        x: {
          ticks: { color: 'var(--text-muted)' },
          grid: { color: gridColor, drawTicks: showGridlines },
          beginAtZero: isColumn ? true : undefined,
        },
        y: {
          ticks: { color: 'var(--text-muted)' },
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
): Chart {
  const dataLabels = config.dataLabels || 'none';

  // Build the visible data + a transparent filler for the bottom half
  const visibleData = data.datasets[0]?.data || [];
  const total = visibleData.reduce((a, b) => a + b, 0);

  const bgColors = visibleData.map((_, j) => colors[j % colors.length]);
  const borderColors = [...bgColors];

  // Add the invisible bottom half (equal to the visible total)
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
      rotation: -90,     // start at top-left (9 o'clock)
      circumference: 180, // only draw top half
      cutout: '60%',
      layout: {
        padding: { bottom: 0 },
      },
      plugins: {
        title: { display: false },
        legend: {
          display: showLegend,
          labels: {
            color: 'var(--text-muted)',
            filter: (item: any) => {
              // Hide the invisible filler slice from the legend
              return item.index < visibleData.length;
            },
          },
        },
        tooltip: {
          filter: (item: any) => {
            // Hide tooltip for the filler slice
            return item.dataIndex < visibleData.length;
          },
        },
        datalabels: buildGaugeDataLabels(dataLabels, visibleData.length),
      },
    },
  } as any);
}

function buildGaugeDataLabels(position: DataLabelPosition, visibleCount: number): Record<string, unknown> {
  if (position === 'none') {
    return { display: false };
  }

  return {
    display: (ctx: any) => ctx.dataIndex < visibleCount, // hide filler label
    color: position === 'outside' ? 'var(--text-normal)' : '#fff',
    font: { size: 12, weight: 'bold' as const },
    anchor: position === 'outside' ? 'end' as const : 'center' as const,
    align: position === 'outside' ? 'end' as const : 'center' as const,
    offset: position === 'outside' ? 8 : 0,
    formatter: (value: number, ctx: any) => {
      if (ctx.dataIndex >= visibleCount) return '';
      const visibleTotal = ctx.dataset.data.slice(0, visibleCount).reduce((a: number, b: number) => a + b, 0);
      const pct = visibleTotal > 0 ? Math.round((value / visibleTotal) * 100) : 0;
      if (position === 'outside') {
        const label = ctx.chart.data.labels?.[ctx.dataIndex] || '';
        return `${label}\n${pct}%`;
      }
      return pct >= 5 ? `${pct}%` : '';
    },
    textAlign: 'center' as const,
  };
}

// ─── Data labels config ───

function buildDataLabelsConfig(position: DataLabelPosition, isPie: boolean, colors: string[]): Record<string, unknown> {
  if (position === 'none') {
    return { display: false };
  }

  if (isPie) {
    if (position === 'outside') {
      return {
        display: true,
        color: 'var(--text-normal)',
        font: { size: 12, weight: 'bold' as const },
        anchor: 'end' as const, align: 'end' as const, offset: 10,
        formatter: (value: number, ctx: any) => {
          const label = ctx.chart.data.labels?.[ctx.dataIndex] || '';
          const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return `${label}\n${pct}%`;
        },
        textAlign: 'center' as const,
      };
    }
    return {
      display: true, color: '#fff',
      font: { size: 12, weight: 'bold' as const },
      anchor: 'center' as const, align: 'center' as const,
      formatter: (value: number, ctx: any) => {
        const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return pct >= 5 ? `${pct}%` : '';
      },
    };
  }

  switch (position) {
    case 'base':
      return {
        display: true, color: '#fff',
        font: { size: 11, weight: 'bold' as const },
        anchor: 'start' as const, align: 'start' as const, offset: 4,
        formatter: (value: number) => value > 0 ? String(value) : '',
      };
    case 'top':
      return {
        display: true, color: '#fff',
        font: { size: 11, weight: 'bold' as const },
        anchor: 'end' as const, align: 'start' as const, offset: 4,
        formatter: (value: number) => value > 0 ? String(value) : '',
      };
    case 'outside':
      return {
        display: true, color: 'var(--text-muted)',
        font: { size: 11, weight: 'bold' as const },
        anchor: 'end' as const, align: 'end' as const, offset: 4,
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
