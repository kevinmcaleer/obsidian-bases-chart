# Obsidian Bases Chart

Visualize your [Obsidian Bases](https://help.obsidian.md/bases) data as bar, pie, and line charts — directly inside your notes.

![Obsidian](https://img.shields.io/badge/Obsidian-%3E%3D1.10.0-blueviolet)

## Features

- **Chart types** — Bar, pie, and line charts powered by Chart.js
- **Bases integration** — Point a chart at any `.base` file and view to pull in filtered data automatically
- **Inline queries** — Filter by tags or folder without needing a `.base` file
- **Visual configuration** — Inline settings panel with dropdowns, toggles, and a color picker
- **YAML config** — All chart settings stored as readable YAML in a fenced code block
- **Aggregation** — Count, sum, or average values grouped by any property
- **Appearance controls** — Custom colors, gridline toggle, legend toggle

## Usage

Add a fenced code block with the `bases-chart` language identifier:

````markdown
```bases-chart
source: Todos.base
view: TODOs
type: bar
labelProperty: file.name
groupBy: status
```
````

Or start with an empty block and use the settings panel (gear icon) to configure everything visually:

````markdown
```bases-chart
```
````

You can also insert a chart via the command palette: **Insert bases chart**.

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `source` | string | — | Name of a `.base` file (e.g. `Todos.base`) |
| `view` | string | first view | Named view within the `.base` file |
| `query.tags` | string[] | — | Filter notes by tags (alternative to `source`) |
| `query.folder` | string | — | Restrict to a folder path |
| `type` | `bar` \| `pie` \| `line` | `bar` | Chart type |
| `labelProperty` | string | `file.name` | Property for x-axis labels / slice names |
| `valueProperty` | string | — | Numeric property for values (omit to count) |
| `groupBy` | string | — | Group notes by this property before aggregating |
| `aggregate` | `count` \| `sum` \| `average` | `count` | Aggregation method |
| `title` | string | — | Chart title |
| `colors` | string[] | default palette | Custom color hex codes |
| `height` | number | `400` | Chart height in pixels |
| `showGridlines` | boolean | `true` | Show/hide axis gridlines |
| `showLegend` | boolean | auto | Show/hide the legend |

## Examples

### Project status breakdown

```yaml
source: Projects.base
type: pie
labelProperty: file.name
groupBy: status
title: Project Status
```

### Todo priority distribution

```yaml
source: Todos.base
view: All Incomplete Todos
type: bar
labelProperty: file.name
groupBy: Priority
aggregate: count
showGridlines: false
```

### Inline query (no .base file needed)

```yaml
query:
  tags:
    - project
type: bar
labelProperty: file.name
groupBy: status
```

## Installation

### From source

1. Clone this repo into your vault's plugin folder:
   ```
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/YOUR_USERNAME/obsidian-bases-chart.git
   cd obsidian-bases-chart
   npm install
   npm run build
   ```
2. Restart Obsidian
3. Go to **Settings → Community Plugins** and enable **Bases Chart**

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/YOUR_USERNAME/obsidian-bases-chart/releases)
2. Create a folder `obsidian-bases-chart` inside your vault's `.obsidian/plugins/` directory
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin

## Development

```bash
npm install
npm run dev    # one-shot build with source maps
npm run build  # production build (minified)
```

## License

MIT
