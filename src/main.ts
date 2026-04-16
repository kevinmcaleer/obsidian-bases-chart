import { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { parseChartConfig } from './configSerializer';
import { queryChartData, queryFilteredNotes } from './dataQuery';
import { renderChart, destroyChart, readThemeColors, applyThemeColors } from './chartRenderer';
import { renderCalendar } from './calendarRenderer';
import { renderStat } from './statRenderer';
import { renderSettingsPanel } from './settingsPanel';
import { Chart } from 'chart.js';

export default class BasesChartPlugin extends Plugin {
  private charts: Map<HTMLElement, Chart> = new Map();
  // Remember each chart's showGridlines so theme re-apply keeps them hidden.
  private chartGridlines: WeakMap<Chart, boolean> = new WeakMap();
  private themeObserver: MutationObserver | null = null;

  onload(): void {
    this.registerMarkdownCodeBlockProcessor('bases-chart', (source, el, ctx) => {
      void this.processChartBlock(source, el, ctx);
    });

    this.addCommand({
      id: 'insert-chart',
      name: 'Insert chart',
      editorCallback: (editor) => {
        const template = [
          '```bases-chart',
          'type: bar',
          '```',
        ].join('\n');
        editor.replaceSelection(template + '\n');
      },
    });

    // Watch for theme switches (Obsidian toggles body.theme-dark / theme-light)
    // and repaint chart axes, gridlines, legend, and outside labels in the
    // new theme's colours. Without this, canvas-rendered text stays the
    // colour it had at render time.
    this.themeObserver = new MutationObserver(() => {
      for (const [el, chart] of this.charts) {
        const container = chart.canvas?.parentElement || el;
        const theme = readThemeColors(container);
        const showGridlines = this.chartGridlines.get(chart) ?? true;
        applyThemeColors(chart, theme, showGridlines);
      }
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  onunload(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    for (const [, chart] of this.charts) {
      destroyChart(chart);
    }
    this.charts.clear();
  }

  private async processChartBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): Promise<void> {
    const trimmed = source.trim();
    const config = trimmed ? parseChartConfig(source) : {
      type: 'bar' as const,
      labelProperty: 'file.name',
    };

    if (!config) {
      el.createDiv({ cls: 'bases-chart-error', text: 'Invalid chart configuration. Check your YAML syntax.' });
      return;
    }

    const wrapper = el.createDiv({ cls: 'bases-chart-wrapper' });
    const needsSetup = !config.sql && !config.source && !config.query;

    const header = wrapper.createDiv({ cls: 'bases-chart-header' });
    renderSettingsPanel(header, config, this.app, (newYaml) => {
      void this.updateCodeBlock(ctx, el, newYaml);
    }, needsSetup);
    if (config.title) {
      wrapper.createDiv({ cls: 'bases-chart-title', text: config.title });
    }

    if (needsSetup) {
      wrapper.createDiv({
        cls: 'bases-chart-empty',
        text: 'Choose a data source in the settings panel above to get started.',
      });
      return;
    }

    const chartContainer = wrapper.createDiv({ cls: 'bases-chart-container' });

    try {
      if (config.type === 'calendar') {
        const notes = await queryFilteredNotes(this.app, config);
        if (notes.length === 0) {
          chartContainer.createDiv({ cls: 'bases-chart-empty', text: 'No data found matching your query.' });
          return;
        }
        renderCalendar(chartContainer, notes, config);
      } else if (config.type === 'stat') {
        // Stat: single-number display. Honour height so it plays nicely
        // inside dashboards, but don't require chart.js.
        const heightPx = `${config.height || 200}px`;
        chartContainer.addClass('bases-chart-container-sized');
        chartContainer.setCssProps({ '--bases-chart-height': heightPx });
        const data = await queryChartData(this.app, config);
        if (data.labels.length === 0 && data.datasets.length === 0) {
          chartContainer.createDiv({ cls: 'bases-chart-empty', text: 'No data found matching your query.' });
          return;
        }
        renderStat(chartContainer, data, config);
      } else {
        // Set chart height via CSS custom property (consumed by styles.css)
        const heightPx = `${config.height || 400}px`;
        chartContainer.addClass('bases-chart-container-sized');
        chartContainer.setCssProps({ '--bases-chart-height': heightPx });

        const data = await queryChartData(this.app, config);
        if (data.labels.length === 0) {
          chartContainer.createDiv({ cls: 'bases-chart-empty', text: 'No data found matching your query.' });
          return;
        }

        const existing = this.charts.get(el);
        if (existing) destroyChart(existing);

        const chart = renderChart(chartContainer, data, config);
        this.charts.set(el, chart);
        this.chartGridlines.set(chart, config.showGridlines !== false);

        const observer = new MutationObserver(() => {
          if (!el.isConnected) {
            const c = this.charts.get(el);
            if (c) { destroyChart(c); this.charts.delete(el); }
            observer.disconnect();
          }
        });
        if (el.parentElement) {
          observer.observe(el.parentElement, { childList: true });
        }
      }
    } catch (err) {
      chartContainer.createDiv({
        cls: 'bases-chart-error',
        text: `Error rendering chart: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async updateCodeBlock(ctx: MarkdownPostProcessorContext, el: HTMLElement, newYaml: string): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(abstractFile instanceof TFile)) return;

    const sectionInfo = ctx.getSectionInfo(el);
    if (sectionInfo) {
      await this.app.vault.process(abstractFile, (content) => {
        const lines = content.split('\n');
        const before = lines.slice(0, sectionInfo.lineStart + 1);
        const after = lines.slice(sectionInfo.lineEnd);
        return [...before, newYaml, ...after].join('\n');
      });
    } else {
      await this.app.vault.process(abstractFile, (content) => {
        const regex = /(```bases-chart\n)([\s\S]*?)(```)/;
        return content.replace(regex, `$1${newYaml}\n$3`);
      });
    }
  }
}
