import { App, setIcon } from 'obsidian';
import { ChartConfig, ChartType, AggregateType, DataLabelPosition, SortField, SortDirection, DEFAULT_COLORS } from './types';
import { listBaseFiles, discoverProperties } from './dataQuery';
import { parseBaseFile, getViewNames } from './baseParser';
import { serializeChartConfig } from './configSerializer';
import { configToSql, sqlToConfig } from './sqlEngine';

export type ConfigChangedCallback = (newYaml: string) => void;

export function renderSettingsPanel(
  container: HTMLElement,
  config: ChartConfig,
  app: App,
  onConfigChanged: ConfigChangedCallback,
  startOpen = false
): HTMLElement {
  const panel = container.createDiv({ cls: 'bases-chart-settings' });

  const toggleBtn = panel.createDiv({ cls: 'bases-chart-settings-toggle' });
  setIcon(toggleBtn, 'settings');
  toggleBtn.setAttribute('aria-label', 'Chart settings');

  const form = panel.createDiv({ cls: 'bases-chart-settings-form' });
  if (!startOpen) form.addClass('is-hidden');
  if (startOpen) toggleBtn.classList.add('is-active');

  toggleBtn.addEventListener('click', () => {
    const isHidden = form.hasClass('is-hidden');
    form.toggleClass('is-hidden', !isHidden);
    toggleBtn.classList.toggle('is-active', isHidden);
  });

  // If SQL is present, parse it to populate the data controls
  if (config.sql) {
    try {
      const parsed = sqlToConfig(config.sql);
      config = { ...config, ...parsed };
    } catch { /* use raw config */ }
  }

  const working = { ...config };
  if (config.query) working.query = { ...config.query };
  if (config.colors) working.colors = [...config.colors];

  let syncing = false;

  // Regenerate SQL from controls and save
  const emitWithSql = () => {
    working.sql = configToSql(working);
    sqlTextarea.value = working.sql;
    sqlError.textContent = '';
    sqlError.addClass('is-hidden');
    onConfigChanged(serializeChartConfig(working));
  };

  // Save appearance-only change (no SQL regeneration needed)
  const emitAppearance = () => {
    onConfigChanged(serializeChartConfig(working));
  };

  // ═══════════════════════════════════════
  // Data source controls
  // ═══════════════════════════════════════

  const sourceRow = createRow(form, 'Source');
  const baseFiles = listBaseFiles(app);
  const sourceSelect = createSelect(sourceRow, ['(none)', ...baseFiles], config.source || '(none)');
  sourceSelect.addEventListener('change', () => {
    const val = sourceSelect.value;
    if (val === '(none)') {
      delete working.source;
      delete working.view;
      viewSelect.empty();
      viewSelect.createEl('option', { text: '(none)', value: '(none)' });
      emitWithSql();
    } else {
      working.source = val;
      void parseBaseFile(app, val).then((base) => {
        viewSelect.empty();
        viewSelect.createEl('option', { text: '(first view)', value: '' });
        if (base) {
          for (const name of getViewNames(base)) {
            viewSelect.createEl('option', { text: name, value: name });
          }
        }
        emitWithSql();
      });
    }
  });

  const viewRow = createRow(form, 'View');
  const viewSelect = createSelect(viewRow, ['(first view)'], config.view || '(first view)');
  viewSelect.addEventListener('change', () => {
    const val = viewSelect.value;
    working.view = val && val !== '(first view)' ? val : undefined;
    emitWithSql();
  });

  if (config.source) {
    void parseBaseFile(app, config.source).then((base) => {
      if (base) {
        viewSelect.empty();
        viewSelect.createEl('option', { text: '(first view)', value: '' });
        for (const name of getViewNames(base)) {
          const opt = viewSelect.createEl('option', { text: name, value: name });
          if (name === config.view) opt.selected = true;
        }
      }
    });
  }

  // --- Chart type (appearance — doesn't change SQL) ---
  const typeRow = createRow(form, 'Chart type');
  const typeGroup = typeRow.createDiv({ cls: 'bases-chart-type-group' });
  const types: ChartType[] = ['bar', 'column', 'pie', 'doughnut', 'gauge', 'line', 'calendar'];
  for (const t of types) {
    const btn = typeGroup.createEl('button', {
      text: t,
      cls: `bases-chart-type-btn ${t === config.type ? 'is-active' : ''}`,
    });
    btn.addEventListener('click', () => {
      typeGroup.querySelectorAll('.bases-chart-type-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      working.type = t;
      emitAppearance();
    });
  }

  // --- Properties ---
  const allProps = discoverProperties(app);

  const labelRow = createRow(form, 'Label property');
  const labelSelect = createSelect(labelRow, allProps, config.labelProperty);
  labelSelect.addEventListener('change', () => {
    working.labelProperty = labelSelect.value;
    emitWithSql();
  });

  const valueRow = createRow(form, 'Value property');
  const valueSelect = createSelect(valueRow, ['(count)', ...allProps], config.valueProperty || '(count)');
  valueSelect.addEventListener('change', () => {
    const val = valueSelect.value;
    working.valueProperty = val === '(count)' ? undefined : val;
    emitWithSql();
  });

  const groupRow = createRow(form, 'Group by');
  const groupSelect = createSelect(groupRow, ['(none)', ...allProps], config.groupBy || '(none)');
  groupSelect.addEventListener('change', () => {
    const val = groupSelect.value;
    working.groupBy = val === '(none)' ? undefined : val;
    emitWithSql();
  });

  const aggRow = createRow(form, 'Aggregate');
  const aggOptions: AggregateType[] = ['count', 'sum', 'average'];
  const aggSelect = createSelect(aggRow, aggOptions, config.aggregate || 'count');
  aggSelect.addEventListener('change', () => {
    working.aggregate = aggSelect.value as AggregateType;
    emitWithSql();
  });

  const sortRow = createRow(form, 'Sort');
  const sortOptions = ['(none)', 'value asc', 'value desc', 'label asc', 'label desc'];
  const currentSort = config.sort ? `${config.sort.field} ${config.sort.direction}` : '(none)';
  const sortSelect = createSelect(sortRow, sortOptions, currentSort);
  sortSelect.addEventListener('change', () => {
    const val = sortSelect.value;
    if (val === '(none)') {
      delete working.sort;
    } else {
      const parts = val.split(' ');
      working.sort = {
        field: parts[0] as SortField,
        direction: parts[1] as SortDirection,
      };
    }
    emitWithSql();
  });

  // --- Title (appearance) ---
  const titleRow = createRow(form, 'Title');
  const titleInput = titleRow.createEl('input', {
    type: 'text',
    cls: 'bases-chart-input',
    value: config.title || '',
    placeholder: 'Chart title',
  });
  titleInput.addEventListener('change', () => {
    working.title = titleInput.value || undefined;
    emitAppearance();
  });

  // ═══════════════════════════════════════
  // Appearance section
  // ═══════════════════════════════════════
  const appearanceHeader = form.createDiv({ cls: 'bases-chart-section-header' });
  appearanceHeader.createEl('span', { text: 'Appearance' });

  const gridRow = createRow(form, 'Gridlines');
  const gridToggle = createToggle(gridRow, config.showGridlines !== false);
  gridToggle.addEventListener('change', () => {
    working.showGridlines = gridToggle.checked;
    emitAppearance();
  });

  const legendRow = createRow(form, 'Legend');
  const legendToggle = createToggle(legendRow, config.showLegend !== false);
  legendToggle.addEventListener('change', () => {
    working.showLegend = legendToggle.checked;
    emitAppearance();
  });

  const dataLabelsRow = createRow(form, 'Data labels');
  const dlOptions: DataLabelPosition[] = ['none', 'base', 'top', 'outside'];
  const dataLabelsSelect = createSelect(dataLabelsRow, dlOptions, config.dataLabels || 'none');
  dataLabelsSelect.addEventListener('change', () => {
    working.dataLabels = dataLabelsSelect.value as DataLabelPosition;
    if (working.dataLabels === 'none') delete working.dataLabels;
    emitAppearance();
  });

  // --- Colors ---
  const colorsRow = createRow(form, 'Colors');
  const colorsContainer = colorsRow.createDiv({ cls: 'bases-chart-colors-container' });
  const currentColors = config.colors && config.colors.length > 0 ? [...config.colors] : [...DEFAULT_COLORS];

  let dragFromIdx = -1;

  function renderColorChips() {
    colorsContainer.empty();
    const chips = colorsContainer.createDiv({ cls: 'bases-chart-color-chips' });

    currentColors.forEach((color, idx) => {
      const chip = chips.createDiv({ cls: 'bases-chart-color-chip' });
      chip.setCssProps({ '--bases-chart-chip-color': color });
      chip.setAttribute('aria-label', color);
      chip.draggable = true;
      chip.dataset.idx = String(idx);

      chip.addEventListener('dragstart', (e) => {
        dragFromIdx = idx;
        chip.classList.add('is-dragging');
        e.dataTransfer?.setData('text/plain', String(idx));
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('is-dragging');
        dragFromIdx = -1;
        chips.querySelectorAll('.bases-chart-color-chip').forEach(c =>
          c.classList.remove('drag-over-left', 'drag-over-right')
        );
      });
      chip.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragFromIdx === idx) return;
        chips.querySelectorAll('.bases-chart-color-chip').forEach(c =>
          c.classList.remove('drag-over-left', 'drag-over-right')
        );
        chip.classList.add(dragFromIdx < idx ? 'drag-over-right' : 'drag-over-left');
      });
      chip.addEventListener('dragleave', () => {
        chip.classList.remove('drag-over-left', 'drag-over-right');
      });
      chip.addEventListener('drop', (e) => {
        e.preventDefault();
        chip.classList.remove('drag-over-left', 'drag-over-right');
        if (dragFromIdx < 0 || dragFromIdx === idx) return;
        const [moved] = currentColors.splice(dragFromIdx, 1);
        currentColors.splice(idx, 0, moved);
        working.colors = [...currentColors];
        renderColorChips();
        emitAppearance();
      });

      const picker = chip.createEl('input', { type: 'color', cls: 'bases-chart-color-picker-input' });
      picker.value = color;
      picker.addEventListener('input', () => {
        currentColors[idx] = picker.value;
        chip.setCssProps({ '--bases-chart-chip-color': picker.value });
        working.colors = [...currentColors];
        emitAppearance();
      });

      const removeBtn = chip.createDiv({ cls: 'bases-chart-color-remove' });
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentColors.length > 1) {
          currentColors.splice(idx, 1);
          working.colors = [...currentColors];
          renderColorChips();
          emitAppearance();
        }
      });
    });

    const addBtn = chips.createDiv({ cls: 'bases-chart-color-add' });
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
      currentColors.push(DEFAULT_COLORS[currentColors.length % DEFAULT_COLORS.length]);
      working.colors = [...currentColors];
      renderColorChips();
      emitAppearance();
    });

    const resetBtn = colorsContainer.createEl('button', {
      text: 'Reset to defaults',
      cls: 'bases-chart-color-reset',
    });
    resetBtn.addEventListener('click', () => {
      currentColors.length = 0;
      currentColors.push(...DEFAULT_COLORS);
      delete working.colors;
      renderColorChips();
      emitAppearance();
    });
  }

  renderColorChips();

  // ═══════════════════════════════════════
  // SQL query section
  // ═══════════════════════════════════════
  const sqlHeader = form.createDiv({ cls: 'bases-chart-section-header' });
  sqlHeader.createEl('span', { text: 'SQL query' });

  const sqlContainer = form.createDiv({ cls: 'bases-chart-sql-container' });
  const sqlTextarea = sqlContainer.createEl('textarea', {
    cls: 'bases-chart-sql-textarea',
    placeholder: 'SELECT COUNT(*) FROM "Todos.base" GROUP BY status',
  });
  sqlTextarea.rows = 3;
  sqlTextarea.spellcheck = false;

  const sqlError = sqlContainer.createDiv({ cls: 'bases-chart-sql-error is-hidden' });

  // Initialize SQL textarea
  sqlTextarea.value = config.sql || (config.source || config.query ? configToSql(config) : '');

  // SQL → UI controls (committed on Enter)
  sqlTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (syncing) return;
      syncing = true;
      try {
        const sql = sqlTextarea.value.trim();
        if (!sql) {
          sqlError.textContent = '';
          sqlError.addClass('is-hidden');
          delete working.sql;
          delete working.source;
          delete working.view;
          delete working.groupBy;
          delete working.valueProperty;
          delete working.valueExpression;
          delete working.sort;
          delete working.query;
          delete working.metrics;
          delete working.sources;
          delete working.unionSources;
          working.aggregate = 'count';
          working.labelProperty = 'file.name';
          setSelectValue(sourceSelect, '(none)');
          setSelectValue(aggSelect, 'count');
          setSelectValue(groupSelect, '(none)');
          setSelectValue(valueSelect, '(count)');
          setSelectValue(sortSelect, '(none)');
          onConfigChanged(serializeChartConfig(working));
          return;
        }

        const parsed = sqlToConfig(sql);
        sqlError.textContent = '';
        sqlError.addClass('is-hidden');

        // Update working config from parsed SQL
        working.source = parsed.source;
        working.view = parsed.view;
        working.aggregate = parsed.aggregate || 'count';
        working.valueProperty = parsed.valueProperty;
        working.valueExpression = parsed.valueExpression;
        working.groupBy = parsed.groupBy;
        working.sort = parsed.sort;
        working.query = parsed.query;
        working.metrics = parsed.metrics;
        working.sources = parsed.sources;
        working.unionSources = parsed.unionSources;
        if (parsed.labelProperty) working.labelProperty = parsed.labelProperty;

        // Update UI controls
        setSelectValue(sourceSelect, working.source || '(none)');
        setSelectValue(aggSelect, working.aggregate || 'count');
        setSelectValue(groupSelect, working.groupBy || '(none)');
        setSelectValue(valueSelect, working.valueProperty || '(count)');
        setSelectValue(sortSelect, working.sort ? `${working.sort.field} ${working.sort.direction}` : '(none)');
        setSelectValue(labelSelect, working.labelProperty || 'file.name');

        working.sql = sql;
        onConfigChanged(serializeChartConfig(working));
      } catch (err) {
        sqlError.textContent = err instanceof Error ? err.message : String(err);
        sqlError.removeClass('is-hidden');
      } finally {
        syncing = false;
      }
    }
  });

  return panel;
}

function createRow(parent: HTMLElement, label: string): HTMLElement {
  const row = parent.createDiv({ cls: 'bases-chart-row' });
  row.createEl('label', { text: label, cls: 'bases-chart-label' });
  return row;
}

function createSelect(parent: HTMLElement, options: string[], selected: string): HTMLSelectElement {
  const select = parent.createEl('select', { cls: 'bases-chart-select' });
  for (const opt of options) {
    const el = select.createEl('option', { text: opt, value: opt });
    if (opt === selected) el.selected = true;
  }
  return select;
}

function createToggle(parent: HTMLElement, checked: boolean): HTMLInputElement {
  const wrapper = parent.createDiv({ cls: 'bases-chart-toggle-wrapper' });
  const input = wrapper.createEl('input', { type: 'checkbox', cls: 'bases-chart-toggle' });
  input.checked = checked;
  const slider = wrapper.createDiv({ cls: 'bases-chart-toggle-slider' });
  slider.addEventListener('click', () => {
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change'));
  });
  if (checked) slider.classList.add('is-active');
  input.addEventListener('change', () => {
    slider.classList.toggle('is-active', input.checked);
  });
  return input;
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  for (const opt of Array.from(select.options)) {
    opt.selected = opt.value === value;
  }
}
