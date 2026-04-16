import { Plugin, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { parseChartConfig } from './configSerializer';
import { queryChartData } from './dataQuery';
import { renderChart, destroyChart } from './chartRenderer';
import { renderSettingsPanel } from './settingsPanel';
import { Chart } from 'chart.js';

export default class BasesChartPlugin extends Plugin {
  private charts: Map<HTMLElement, Chart> = new Map();

  async onload() {
    this.registerMarkdownCodeBlockProcessor('bases-chart', async (source, el, ctx) => {
      await this.processChartBlock(source, el, ctx);
    });

    this.addCommand({
      id: 'insert-bases-chart',
      name: 'Insert bases chart',
      editorCallback: (editor) => {
        const template = [
          '```bases-chart',
          'type: bar',
          'labelProperty: file.name',
          'groupBy: status',
          '```',
        ].join('\n');
        editor.replaceSelection(template + '\n');
      },
    });
  }

  onunload() {
    for (const [, chart] of this.charts) {
      destroyChart(chart);
    }
    this.charts.clear();
  }

  private async processChartBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    // Parse config — treat empty/whitespace-only blocks as a blank starter config
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
    const needsSetup = !config.source && !config.query;

    // Always render the settings panel — open it by default when the chart has no data source yet
    renderSettingsPanel(wrapper, config, this.app, (newYaml) => {
      this.updateCodeBlock(ctx, el, newYaml);
    }, needsSetup);

    if (needsSetup) {
      wrapper.createDiv({
        cls: 'bases-chart-empty',
        text: 'Choose a data source in the settings panel above to get started.',
      });
      return;
    }

    // Chart container
    const chartContainer = wrapper.createDiv({ cls: 'bases-chart-container' });
    chartContainer.style.height = `${config.height || 400}px`;

    try {
      const data = await queryChartData(this.app, config);

      if (data.labels.length === 0) {
        chartContainer.createDiv({ cls: 'bases-chart-empty', text: 'No data found matching your query.' });
        return;
      }

      const existing = this.charts.get(el);
      if (existing) destroyChart(existing);

      const chart = renderChart(chartContainer, data, config);
      this.charts.set(el, chart);

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

    } catch (err) {
      chartContainer.createDiv({
        cls: 'bases-chart-error',
        text: `Error rendering chart: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async updateCodeBlock(ctx: MarkdownPostProcessorContext, el: HTMLElement, newYaml: string) {
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
      // Fallback: regex replace
      await this.app.vault.process(abstractFile, (content) => {
        const regex = /(```bases-chart\n)([\s\S]*?)(```)/;
        return content.replace(regex, `$1${newYaml}\n$3`);
      });
    }
  }
}
