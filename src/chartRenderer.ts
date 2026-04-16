import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ChartConfig, ChartDataResult, DEFAULT_COLORS } from './types';

Chart.register(...registerables);

/**
 * Render a Chart.js chart into the given container element.
 * Returns the Chart instance for later cleanup.
 */
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

  const chartConfig = buildChartConfig(config, data, colors);
  return new Chart(canvas, chartConfig);
}

function buildChartConfig(
  config: ChartConfig,
  data: ChartDataResult,
  colors: string[],
): ChartConfiguration {
  const type = config.type;
  const isPie = type === 'pie';
  const showGridlines = config.showGridlines !== false; // default true
  const showLegend = config.showLegend !== undefined ? config.showLegend : (isPie || data.datasets.length > 1);

  const datasets = data.datasets.map((ds, i) => {
    if (isPie) {
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: data.labels.map((_, j) => colors[j % colors.length]),
        borderColor: data.labels.map((_, j) => colors[j % colors.length]),
        borderWidth: 1,
      };
    }
    const isLine = type === 'line';
    return {
      label: ds.label,
      data: ds.data,
      backgroundColor: colors[i % colors.length] + (isLine ? '33' : 'cc'),
      borderColor: isLine ? colors[i % colors.length] : 'transparent',
      borderWidth: isLine ? 2 : 0,
      fill: isLine ? false : undefined,
      tension: isLine ? 0.3 : undefined,
      borderRadius: isLine ? undefined : 4,
    };
  });

  const gridColor = showGridlines ? 'var(--background-modifier-border)' : 'transparent';

  return {
    type: type as 'bar' | 'pie' | 'line',
    data: {
      labels: data.labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!config.title,
          text: config.title || '',
          color: 'var(--text-normal)',
          font: { size: 16 },
        },
        legend: {
          display: showLegend,
          labels: {
            color: 'var(--text-muted)',
          },
        },
        tooltip: {
          enabled: true,
        },
      },
      scales: isPie ? {} : {
        x: {
          ticks: { color: 'var(--text-muted)' },
          grid: { color: gridColor, drawTicks: showGridlines },
        },
        y: {
          ticks: { color: 'var(--text-muted)' },
          grid: { color: gridColor, drawTicks: showGridlines },
          beginAtZero: true,
        },
      },
    },
  };
}

/**
 * Destroy a chart instance and clean up.
 */
export function destroyChart(chart: Chart | null): void {
  if (chart) {
    chart.destroy();
  }
}
