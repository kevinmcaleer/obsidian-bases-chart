import { ChartConfig } from './types';
import { NoteData } from './baseParser';

const CELL_SIZE = 13;
const CELL_GAP = 2;
const WEEK_WIDTH = CELL_SIZE + CELL_GAP; // 15px per week column

/**
 * Render a GitHub-style contribution calendar heatmap.
 * Shows the last 52 weeks of data with day cells colored by note count.
 */
export function renderCalendar(
  container: HTMLElement,
  notes: NoteData[],
  config: ChartConfig,
): void {
  const color = config.colors?.[0] || '#59a14f';
  const weeks = 52;

  const dayCounts = new Map<string, number>();
  for (const note of notes) {
    const date = new Date(note.ctime);
    const key = dateKey(date);
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }

  const maxCount = Math.max(1, ...Array.from(dayCounts.values()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeks * 7) - startDate.getDay());

  const monthLabels: Array<{ text: string; weekIndex: number }> = [];
  let lastMonth = -1;
  let lastYear = -1;

  const wrapper = container.createDiv({ cls: 'bases-chart-calendar' });
  const calendarBody = wrapper.createDiv({ cls: 'bases-chart-calendar-body' });

  // Day-of-week labels
  const dayLabelsCol = calendarBody.createDiv({ cls: 'bases-chart-calendar-day-labels' });
  const dayNames = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  for (const name of dayNames) {
    dayLabelsCol.createDiv({ cls: 'bases-chart-calendar-day-label', text: name });
  }

  // Main grid area (month labels + week columns)
  const gridArea = calendarBody.createDiv({ cls: 'bases-chart-calendar-grid-area' });
  const monthRow = gridArea.createDiv({ cls: 'bases-chart-calendar-months' });
  const weeksContainer = gridArea.createDiv({ cls: 'bases-chart-calendar-weeks' });

  const cursor = new Date(startDate);
  let weekIndex = 0;

  while (cursor <= endDate) {
    const weekCol = weeksContainer.createDiv({ cls: 'bases-chart-calendar-week' });

    for (let dow = 0; dow < 7; dow++) {
      if (cursor > endDate) {
        weekCol.createDiv({ cls: 'bases-chart-calendar-cell bases-chart-calendar-cell-empty' });
      } else {
        const key = dateKey(cursor);
        const count = dayCounts.get(key) || 0;
        const intensity = count > 0 ? Math.ceil((count / maxCount) * 4) : 0;

        const cell = weekCol.createDiv({ cls: 'bases-chart-calendar-cell' });
        cell.setCssProps({ '--bases-chart-cell-color': getIntensityColor(color, intensity) });
        cell.title = `${formatDate(cursor)}: ${count} note${count !== 1 ? 's' : ''}`;

        const month = cursor.getMonth();
        const year = cursor.getFullYear();
        if (month !== lastMonth && dow === 0) {
          const showYear = year !== lastYear;
          const labelText = showYear
            ? `${cursor.toLocaleDateString('en', { month: 'short' })} ${year}`
            : cursor.toLocaleDateString('en', { month: 'short' });
          monthLabels.push({ text: labelText, weekIndex });
          lastMonth = month;
          lastYear = year;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    weekIndex++;
  }

  // Render month labels positioned by week index via CSS custom property
  for (const ml of monthLabels) {
    const label = monthRow.createDiv({ cls: 'bases-chart-calendar-month-label' });
    label.textContent = ml.text;
    label.setCssProps({ '--bases-chart-month-left': `${ml.weekIndex * WEEK_WIDTH}px` });
  }

  // Legend
  const legend = wrapper.createDiv({ cls: 'bases-chart-calendar-legend' });
  legend.createEl('span', { text: 'Less', cls: 'bases-chart-calendar-legend-text' });
  for (let i = 0; i <= 4; i++) {
    const swatch = legend.createDiv({ cls: 'bases-chart-calendar-cell bases-chart-calendar-legend-swatch' });
    swatch.setCssProps({ '--bases-chart-cell-color': getIntensityColor(color, i) });
  }
  legend.createEl('span', { text: 'More', cls: 'bases-chart-calendar-legend-text' });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function getIntensityColor(baseColor: string, level: number): string {
  if (level === 0) return 'var(--background-modifier-border)';

  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);

  const opacities = [0, 0.3, 0.5, 0.75, 1.0];
  const alpha = opacities[Math.min(level, 4)];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
