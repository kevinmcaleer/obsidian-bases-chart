# Bases Chart

Visualize your [Obsidian Bases](https://help.obsidian.md/bases) data as charts — directly inside your notes.

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.10.0-blueviolet)

## Features

- **8 chart types** — bar, column (horizontal bar), pie, doughnut, gauge (half-doughnut), line, GitHub-style calendar heatmap, and **stat** (single-number KPI)
- **SQL query language** — familiar syntax for querying your Bases data
- **Visual configuration** — inline settings panel with dropdowns, toggles, draggable color palette, and live SQL preview
- **Multi-metric queries** — count multiple conditions in a single chart (e.g. "missing tags" vs "missing dates")
- **Multi-source** — compare data across multiple `.base` files side-by-side, or merge them with UNION
- **Date bucketing** — `GROUP BY month(file.ctime)` / `year(...)` / `day(...)` for time-series charts
- **Relative-time functions** — `today()`, `now()`, `daysSince()`, `daysUntil()`, `year()`, `month()`, `day()`
- **Sorting** — order bars by value or label, ascending or descending
- **Data labels** — show values at base, top, or outside of bars/slices with callout support for pie charts
- **Appearance controls** — custom colors with drag-to-reorder, gridline toggle, legend toggle, font size and colour for stat charts, configurable chart height

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
type: bar                    # chart type (bar | column | pie | doughnut | gauge | line | calendar | stat)
sql: SELECT COUNT(*) FROM "Todos.base" GROUP BY status
title: My Chart              # optional title
showGridlines: true          # show/hide gridlines
showLegend: true             # show/hide legend
dataLabels: outside          # none | base | top | outside
colors:                      # custom color palette
  - "#4e79a7"
  - "#f28e2b"
height: 400                  # chart height in pixels (default 400; 200 for stat)
fontSize: 72                 # stat chart only — number font size in pixels (default 72)
fontColor: "#4e79a7"         # stat chart only — hex colour; omit to inherit the theme
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

Top-level `WHERE` supports tag and folder filters:

```sql
WHERE tags CONTAINS 'project'
WHERE folder = 'Work'
WHERE tags CONTAINS 'todo' AND folder = 'Work'
```

Per-metric `WHERE` (inside a multi-metric `SELECT`) supports a richer
comparator set, including relative-time functions and date-bucket
wrappers on the left-hand side:

```sql
-- Operators: =, !=, >, >=, <, <=, CONTAINS, IS EMPTY, IS NOT EMPTY
COUNT(*) WHERE status != 'done'
COUNT(*) WHERE Priority >= 3
COUNT(*) WHERE date IS NOT EMPTY

-- today() expands to 'YYYY-MM-DD' (local date)
COUNT(*) WHERE day(file.ctime) = today()       -- created today
COUNT(*) WHERE month(file.ctime) = month(today()) -- created this month (see note below)

-- now() expands to current epoch milliseconds
COUNT(*) WHERE file.mtime >= 1760000000000     -- modified since this timestamp
```

> **Note:** `month(today())` currently requires `today()` to resolve to a
> value whose `month(...)` wrapper produces the same bucket format. The
> cleanest pattern for "created this month" is still to group by month
> and pick the current bucket — or use a literal `'2026-04'`.

### GROUP BY

```sql
GROUP BY status               -- by a property
GROUP BY day(file.ctime)      -- per-day bucket   → "YYYY-MM-DD"
GROUP BY month(file.ctime)    -- per-month bucket → "YYYY-MM"
GROUP BY year(file.ctime)     -- per-year bucket  → "YYYY"
```

Date-bucket grouping works on any date property — frontmatter dates
(`GROUP BY month(published)`) as well as file timestamps.

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

| Function | Where it's valid | Description |
|---|---|---|
| `daysSince(prop)` | `SELECT` | Days between property date and today (per note) |
| `daysUntil(prop)` | `SELECT` | Days from today to property date (per note) |
| `year(prop)` | `SELECT`, `GROUP BY`, `WHERE` LHS | Year bucket → `"YYYY"` |
| `month(prop)` | `SELECT`, `GROUP BY`, `WHERE` LHS | Month bucket → `"YYYY-MM"` |
| `day(prop)` | `SELECT`, `GROUP BY`, `WHERE` LHS | Day bucket → `"YYYY-MM-DD"` |
| `today()` | `WHERE` RHS (per-metric) | Expands to `'YYYY-MM-DD'` (local date) |
| `now()` | `WHERE` RHS (per-metric) | Expands to current epoch milliseconds |

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
| `stat` | Single large number — ideal for dashboards / KPI tiles |

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

### Notes created today (stat tile)
```yaml
type: stat
title: Notes created today
sql: SELECT COUNT(*) WHERE day(file.ctime) = today() AS "Today" FROM notes
fontSize: 96
fontColor: "#4e79a7"
```

### Notes created each month (time series)
```yaml
type: bar
title: Notes per month
sql: SELECT COUNT(*) FROM notes GROUP BY month(file.ctime) ORDER BY label asc
dataLabels: top
showLegend: false
```

### KPI row — three stat tiles side-by-side
Drop these in a 3-column layout (e.g. the Dashboards plugin) for a tidy
summary strip:

```yaml
type: stat
title: Total notes
sql: SELECT COUNT(*) AS "Notes" FROM notes
```

```yaml
type: stat
title: Created this month
sql: SELECT COUNT(*) WHERE month(file.ctime) = '2026-04' AS "This month" FROM notes
fontColor: "#59a14f"
```

```yaml
type: stat
title: Modified in last 24h
sql: SELECT COUNT(*) WHERE file.mtime >= 1760000000000 AS "Last 24h" FROM notes
fontColor: "#f28e2b"
```

## Installation

### From Obsidian

1. Open **Settings → Community Plugins → Browse**
2. Search for **Bases Chart**
3. Click **Install**, then **Enable**

### From source

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/kevinmcaleer/obsidian-bases-chart.git
cd bases-chart
npm install
npm run build
```

Restart Obsidian and enable the plugin in Settings → Community Plugins.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/kevinmcaleer/obsidian-bases-chart/releases)
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
