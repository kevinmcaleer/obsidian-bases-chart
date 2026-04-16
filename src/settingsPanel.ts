import { App, setIcon } from 'obsidian';
import { ChartConfig, ChartType, AggregateType, DEFAULT_COLORS } from './types';
import { listBaseFiles, discoverProperties } from './dataQuery';
import { parseBaseFile, getViewNames } from './baseParser';
import { serializeChartConfig } from './configSerializer';

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
  form.style.display = startOpen ? 'block' : 'none';
  if (startOpen) toggleBtn.classList.add('is-active');

  toggleBtn.addEventListener('click', () => {
    const isHidden = form.style.display === 'none';
    form.style.display = isHidden ? 'block' : 'none';
    toggleBtn.classList.toggle('is-active', isHidden);
  });

  const working = { ...config };
  if (config.query) working.query = { ...config.query };
  if (config.colors) working.colors = [...config.colors];

  const emit = () => {
    const yaml = serializeChartConfig(working);
    onConfigChanged(yaml);
  };

  // --- Source ---
  const sourceRow = createRow(form, 'Source');
  const baseFiles = listBaseFiles(app);
  const sourceSelect = createSelect(sourceRow, ['(none)', ...baseFiles], config.source || '(none)');
  sourceSelect.addEventListener('change', async () => {
    const val = sourceSelect.value;
    if (val === '(none)') {
      delete working.source;
      delete working.view;
      viewSelect.innerHTML = '';
      viewSelect.createEl('option', { text: '(none)', value: '(none)' });
    } else {
      working.source = val;
      const base = await parseBaseFile(app, val);
      viewSelect.innerHTML = '';
      viewSelect.createEl('option', { text: '(first view)', value: '' });
      if (base) {
        for (const name of getViewNames(base)) {
          viewSelect.createEl('option', { text: name, value: name });
        }
      }
    }
    emit();
  });

  // --- View ---
  const viewRow = createRow(form, 'View');
  const viewSelect = createSelect(viewRow, ['(first view)'], config.view || '(first view)');
  viewSelect.addEventListener('change', () => {
    const val = viewSelect.value;
    working.view = val && val !== '(first view)' ? val : undefined;
    emit();
  });

  if (config.source) {
    parseBaseFile(app, config.source).then(base => {
      if (base) {
        viewSelect.innerHTML = '';
        viewSelect.createEl('option', { text: '(first view)', value: '' });
        for (const name of getViewNames(base)) {
          const opt = viewSelect.createEl('option', { text: name, value: name });
          if (name === config.view) opt.selected = true;
        }
      }
    });
  }

  // --- Chart type ---
  const typeRow = createRow(form, 'Chart type');
  const typeGroup = typeRow.createDiv({ cls: 'bases-chart-type-group' });
  const types: ChartType[] = ['bar', 'pie', 'line'];
  for (const t of types) {
    const btn = typeGroup.createEl('button', {
      text: t,
      cls: `bases-chart-type-btn ${t === config.type ? 'is-active' : ''}`,
    });
    btn.addEventListener('click', () => {
      typeGroup.querySelectorAll('.bases-chart-type-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      working.type = t;
      emit();
    });
  }

  // --- Properties ---
  const allProps = discoverProperties(app);

  const labelRow = createRow(form, 'Label property');
  const labelSelect = createSelect(labelRow, allProps, config.labelProperty);
  labelSelect.addEventListener('change', () => {
    working.labelProperty = labelSelect.value;
    emit();
  });

  const valueRow = createRow(form, 'Value property');
  const valueSelect = createSelect(valueRow, ['(count)', ...allProps], config.valueProperty || '(count)');
  valueSelect.addEventListener('change', () => {
    const val = valueSelect.value;
    working.valueProperty = val === '(count)' ? undefined : val;
    emit();
  });

  const groupRow = createRow(form, 'Group by');
  const groupSelect = createSelect(groupRow, ['(none)', ...allProps], config.groupBy || '(none)');
  groupSelect.addEventListener('change', () => {
    const val = groupSelect.value;
    working.groupBy = val === '(none)' ? undefined : val;
    emit();
  });

  // --- Aggregate ---
  const aggRow = createRow(form, 'Aggregate');
  const aggOptions: AggregateType[] = ['count', 'sum', 'average'];
  const aggSelect = createSelect(aggRow, aggOptions, config.aggregate || 'count');
  aggSelect.addEventListener('change', () => {
    working.aggregate = aggSelect.value as AggregateType;
    emit();
  });

  // --- Title ---
  const titleRow = createRow(form, 'Title');
  const titleInput = titleRow.createEl('input', {
    type: 'text',
    cls: 'bases-chart-input',
    value: config.title || '',
    placeholder: 'Chart title',
  });
  titleInput.addEventListener('change', () => {
    working.title = titleInput.value || undefined;
    emit();
  });

  // ═══════════════════════════════════════
  // Appearance section
  // ═══════════════════════════════════════
  const appearanceHeader = form.createDiv({ cls: 'bases-chart-section-header' });
  appearanceHeader.createEl('span', { text: 'Appearance' });

  // --- Gridlines toggle ---
  const gridRow = createRow(form, 'Gridlines');
  const gridToggle = createToggle(gridRow, config.showGridlines !== false);
  gridToggle.addEventListener('change', () => {
    working.showGridlines = gridToggle.checked;
    emit();
  });

  // --- Legend toggle ---
  const legendRow = createRow(form, 'Legend');
  const legendToggle = createToggle(legendRow, config.showLegend !== false);
  legendToggle.addEventListener('change', () => {
    working.showLegend = legendToggle.checked;
    emit();
  });

  // --- Colors ---
  const colorsRow = createRow(form, 'Colors');
  const colorsContainer = colorsRow.createDiv({ cls: 'bases-chart-colors-container' });
  const currentColors = config.colors && config.colors.length > 0 ? [...config.colors] : [...DEFAULT_COLORS];

  function renderColorChips() {
    colorsContainer.empty();
    const chips = colorsContainer.createDiv({ cls: 'bases-chart-color-chips' });

    currentColors.forEach((color, idx) => {
      const chip = chips.createDiv({ cls: 'bases-chart-color-chip' });
      chip.style.backgroundColor = color;
      chip.setAttribute('aria-label', color);

      // Native color picker on click
      const picker = chip.createEl('input', { type: 'color', cls: 'bases-chart-color-picker-input' });
      picker.value = color;
      picker.addEventListener('input', () => {
        currentColors[idx] = picker.value;
        chip.style.backgroundColor = picker.value;
        working.colors = [...currentColors];
        emit();
      });

      // Remove button
      const removeBtn = chip.createDiv({ cls: 'bases-chart-color-remove' });
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentColors.length > 1) {
          currentColors.splice(idx, 1);
          working.colors = [...currentColors];
          renderColorChips();
          emit();
        }
      });
    });

    // Add color button
    const addBtn = chips.createDiv({ cls: 'bases-chart-color-add' });
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
      currentColors.push(DEFAULT_COLORS[currentColors.length % DEFAULT_COLORS.length]);
      working.colors = [...currentColors];
      renderColorChips();
      emit();
    });

    // Reset to defaults button
    const resetBtn = colorsContainer.createEl('button', {
      text: 'Reset to defaults',
      cls: 'bases-chart-color-reset',
    });
    resetBtn.addEventListener('click', () => {
      currentColors.length = 0;
      currentColors.push(...DEFAULT_COLORS);
      delete working.colors;
      renderColorChips();
      emit();
    });
  }

  renderColorChips();

  // ═══════════════════════════════════════
  // Inline query section
  // ═══════════════════════════════════════
  const queryHeader = form.createDiv({ cls: 'bases-chart-section-header' });
  queryHeader.createEl('span', { text: 'Inline Query (optional)' });

  const tagsRow = createRow(form, 'Filter tags');
  const tagsInput = tagsRow.createEl('input', {
    type: 'text',
    cls: 'bases-chart-input',
    value: config.query?.tags?.join(', ') || '',
    placeholder: 'e.g. project, todo',
  });
  tagsInput.addEventListener('change', () => {
    const val = tagsInput.value.trim();
    if (val) {
      if (!working.query) working.query = {};
      working.query.tags = val.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      if (working.query) delete working.query.tags;
      if (working.query && Object.keys(working.query).length === 0) delete working.query;
    }
    emit();
  });

  const folderRow = createRow(form, 'Filter folder');
  const folderInput = folderRow.createEl('input', {
    type: 'text',
    cls: 'bases-chart-input',
    value: config.query?.folder || '',
    placeholder: 'e.g. Vault/Projects',
  });
  folderInput.addEventListener('change', () => {
    const val = folderInput.value.trim();
    if (val) {
      if (!working.query) working.query = {};
      working.query.folder = val;
    } else {
      if (working.query) delete working.query.folder;
      if (working.query && Object.keys(working.query).length === 0) delete working.query;
    }
    emit();
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
