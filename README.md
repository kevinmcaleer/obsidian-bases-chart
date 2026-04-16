# Bases Chart

Visualize your [Obsidian Bases](https://help.obsidian.md/bases) data as charts — directly inside your notes.

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.10.0-blueviolet)

## Features

- **7 chart types** — bar, column (horizontal bar), pie, doughnut, gauge (half-doughnut), line, and GitHub-style calendar heatmap
- **SQL query language** — familiar syntax for querying your Bases data
- **Visual configuration** — inline settings panel with dropdowns, toggles, draggable color palette, and live SQL preview
- **Multi-metric queries** — count multiple conditions in a single chart (e.g. "missing tags" vs "missing dates")
- **Multi-source** — compare data across multiple `.base` files side-by-side, or merge them with UNION
- **Computed values** — built-in functions like `daysSince()`, `daysUntil()`, `year()`, `month()`
- **Sorting** — order bars by value or label, ascending or descending
- **Data labels** — show values at base, top, or outside of bars/slices with callout support for pie charts
- **Appearance controls** — custom colors with drag-to-reorder, gridline toggle, legend toggle

## Quick Start

Add a fenced code block with `bases-chart` and write a SQL query:

````markdown
```bases-chart
type: bar
sql: SELECT COUNT(*) FROM "Todos.base" GROUP BY status
```
````

Or start with an empty block and use the gear icon to configure visually:

````markdown
```bases-chart
```
````

You can also insert a chart via the command palette: **Insert bases chart**.

## Configuration

The YAML config has two parts: **appearance** (stored in YAML) and **data** (stored as SQL):

```yaml
type: bar                    # chart type
sql: SELECT COUNT(*) FROM "Todos.base" GROUP BY status
title: My Chart              # optional title
showGridlines: true          # show/hide gridlines
showLegend: true             # show/hide legend
dataLabels: outside          # none | base | top | outside
colors:                      # custom color palette
  - "#4e79a7"
  - "#f28e2b"
height: 400                  # chart height in pixels
```

## SQL Reference

### Basic queries

```sql
-- Count notes grouped by a property
SELECT COUNT(*) FROM "Todos.base" GROUP BY status

-- Show a value per note
SELECT file.name, Priority FROM "Projects.base/Starred"

-- Computed values
SELECT daysSince(file.ctime) FROM "Todos.base/Starred" ORDER BY value DESC

-- Aggregate with grouping
SELECT AVG(rating) FROM "Books.base" GROUP BY categories
```

### SELECT clause

| Syntax | Meaning |
|---|---|
| `SELECT file.name, Rank` | Per-note: label + value |
| `SELECT daysSince(file.ctime)` | Per-note: computed value |
| `SELECT COUNT(*)` | Count (use with GROUP BY) |
| `SELECT SUM(prop)` | Sum values per group |
| `SELECT AVG(prop)` | Average values per group |

### FROM clause

| Syntax | Meaning |
|---|---|
| `FROM "Todos.base"` | Use first view from a Base |
| `FROM "Todos.base/Starred"` | Use a specific named view |
| `FROM "A.base", "B.base"` | Separate datasets (grouped bars) |
| `FROM "A.base" UNION "B.base"` | Merge into one pool |
| `FROM notes` | All notes in vault |

### WHERE clause

```sql
WHERE tags CONTAINS 'project'
WHERE status != 'done'
WHERE Priority > 3
WHERE date IS EMPTY
WHERE date IS NOT EMPTY
WHERE tags CONTAINS 'todo' AND folder = 'Work'
```

### Multi-metric SELECT

Each metric gets its own bar/slice:

```sql
SELECT
  COUNT(*) WHERE tags IS EMPTY AS "Missing Tags",
  COUNT(*) WHERE topics IS EMPTY AS "Missing Topics",
  COUNT(*) WHERE date IS EMPTY AS "Missing Dates"
FROM "Todos.base"
```

### ORDER BY

```sql
ORDER BY value DESC    -- sort by bar height
ORDER BY value ASC     -- smallest first
ORDER BY label ASC     -- alphabetical
ORDER BY label DESC    -- reverse alphabetical
```

### Built-in functions

| Function | Description |
|---|---|
| `daysSince(prop)` | Days between property date and today |
| `daysUntil(prop)` | Days from today to property date |
| `year(prop)` | Extract year from a date |
| `month(prop)` | Extract month (1-12) |
| `day(prop)` | Extract day of month (1-31) |

## Chart Types

| Type | Description |
|---|---|
| `bar` | Vertical bar chart |
| `column` | Horizontal bar chart |
| `pie` | Pie chart |
| `doughnut` | Doughnut chart (pie with center hole) |
| `gauge` | Half-doughnut (top hemisphere only) |
| `line` | Line chart |
| `calendar` | GitHub-style contribution heatmap (52 weeks) |

## Examples

### Todo age ranking
```yaml
type: bar
sql: SELECT daysSince(file.ctime) FROM "Todos.base/Starred" ORDER BY value DESC
dataLabels: outside
showGridlines: false
```

### Project status gauge
```yaml
type: gauge
sql: SELECT COUNT(*) FROM "Projects.base" GROUP BY status
dataLabels: outside
```

### Note activity calendar
```yaml
type: calendar
sql: SELECT COUNT(*) FROM "Todos.base"
title: Note Activity
```

### Data quality audit
```yaml
type: bar
sql: >
  SELECT
    COUNT(*) WHERE tags IS EMPTY AS "No Tags",
    COUNT(*) WHERE topics IS EMPTY AS "No Topics",
    COUNT(*) WHERE date IS EMPTY AS "No Date"
  FROM "Todos.base"
dataLabels: outside
```

## Installation

### From Obsidian

1. Open **Settings → Community Plugins → Browse**
2. Search for **Bases Chart**
3. Click **Install**, then **Enable**

### From source

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/YOUR_USERNAME/bases-chart.git
cd bases-chart
npm install
npm run build
```

Restart Obsidian and enable the plugin in Settings → Community Plugins.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/YOUR_USERNAME/bases-chart/releases)
2. Create a folder `bases-chart` inside `.obsidian/plugins/`
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin

## Development

```bash
npm install
npm run dev    # one-shot build with source maps
npm run build  # production build (minified, auto-bumps version)
```

## License

MIT
