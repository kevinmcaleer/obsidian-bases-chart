import { ChartConfig, AggregateType, MetricItem, SortField, SortDirection } from './types';

/**
 * Build a SQL string from a ChartConfig.
 */
export function configToSql(config: ChartConfig): string {
  const parts: string[] = [];

  // SELECT clause
  if (config.metrics && config.metrics.length > 0) {
    const items = config.metrics.map(m => {
      let expr = buildAggExpr(m.aggregate, m.valueProperty);
      if (m.where) expr += ` WHERE ${m.where}`;
      expr += ` AS "${escapeQuotedIdent(m.label)}"`;
      return expr;
    });
    parts.push(`SELECT\n  ${items.join(',\n  ')}`);
  } else {
    parts.push(`SELECT ${buildSelectClause(config)}`);
  }

  // FROM clause
  if (config.sources && config.sources.length > 1) {
    const quoted = config.sources.map(s => `"${escapeQuotedIdent(s)}"`);
    parts.push(`FROM ${quoted.join(', ')}`);
  } else if (config.unionSources && config.unionSources.length > 1) {
    const quoted = config.unionSources.map(s => `"${escapeQuotedIdent(s)}"`);
    parts.push(`FROM ${quoted.join(' UNION ')}`);
  } else {
    parts.push(`FROM ${buildFromClause(config)}`);
  }

  // WHERE clause (top-level, not per-metric)
  const whereExprs = buildWhereClauses(config);
  if (whereExprs.length > 0) {
    parts.push(`WHERE ${whereExprs.join(' AND ')}`);
  }

  // GROUP BY
  if (config.groupBy) {
    parts.push(`GROUP BY ${quoteIdent(config.groupBy)}`);
  }

  // ORDER BY
  if (config.sort) {
    parts.push(`ORDER BY ${config.sort.field} ${config.sort.direction.toUpperCase()}`);
  }

  return parts.join(' ');
}

/**
 * Parse a SQL string back into ChartConfig fields.
 * Throws on parse errors.
 */
export function sqlToConfig(sql: string): Partial<ChartConfig> {
  const config: Partial<ChartConfig> = {};
  const trimmed = sql.trim();
  if (!trimmed) return config;

  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT')) {
    throw new Error('Query must start with SELECT');
  }

  const clauses = splitClauses(trimmed);

  // Parse SELECT — check for multi-metric (contains AS)
  if (clauses.select) {
    if (/\bAS\s+"/i.test(clauses.select) || /\bAS\s+'/i.test(clauses.select)) {
      config.metrics = parseMultiMetricSelect(clauses.select);
    } else {
      parseSelectClause(clauses.select, config);
    }
  }

  // Parse FROM — check for multi-source
  if (clauses.from) {
    parseFromClauseExtended(clauses.from, config);
  }

  // Parse WHERE
  if (clauses.where) {
    parseWhereClause(clauses.where, config);
  }

  // Parse GROUP BY
  if (clauses.groupBy) {
    config.groupBy = unquoteIdent(clauses.groupBy.trim());
  }

  // Parse ORDER BY
  if (clauses.orderBy) {
    parseOrderByClause(clauses.orderBy.trim(), config);
  }

  return config;
}

// ─── configToSql helpers ───

function buildAggExpr(aggregate: AggregateType, valueProperty?: string): string {
  if (valueProperty) {
    switch (aggregate) {
      case 'sum': return `SUM(${quoteIdent(valueProperty)})`;
      case 'average': return `AVG(${quoteIdent(valueProperty)})`;
      case 'count': return `COUNT(*)`;
    }
  }
  return 'COUNT(*)';
}

function buildSelectClause(config: ChartConfig): string {
  // Value expression takes priority (e.g. daysSince(file.ctime))
  if (config.valueExpression) {
    return config.valueExpression;
  }

  const agg = config.aggregate || 'count';
  const valueProp = config.valueProperty;
  const label = config.labelProperty || 'file.name';

  // With groupBy: aggregate function
  if (config.groupBy) {
    if (valueProp) return buildAggExpr(agg, valueProp);
    return 'COUNT(*)';
  }

  // Per-note with a value property: "label, value" (two-field SELECT)
  if (valueProp) {
    return `${quoteIdent(label)}, ${quoteIdent(valueProp)}`;
  }

  // Just a label property
  return quoteIdent(label);
}

function buildFromClause(config: ChartConfig): string {
  if (config.source) {
    const base = config.source;
    if (config.view) {
      return `"${escapeQuotedIdent(base)}/${escapeQuotedIdent(config.view)}"`;
    }
    return `"${escapeQuotedIdent(base)}"`;
  }
  return 'notes';
}

function buildWhereClauses(config: ChartConfig): string[] {
  const conditions: string[] = [];

  if (config.query?.tags && config.query.tags.length > 0) {
    for (const tag of config.query.tags) {
      conditions.push(`tags CONTAINS '${escapeString(tag)}'`);
    }
  }

  if (config.query?.folder) {
    conditions.push(`folder = '${escapeString(config.query.folder)}'`);
  }

  return conditions;
}

function quoteIdent(name: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) return name;
  return `"${escapeQuotedIdent(name)}"`;
}

function escapeString(s: string): string {
  return s.replace(/'/g, "''");
}

function escapeQuotedIdent(s: string): string {
  return s.replace(/"/g, '""');
}

// ─── sqlToConfig helpers ───

interface SqlClauses {
  select: string;
  from: string;
  where: string;
  groupBy: string;
  orderBy: string;
}

function splitClauses(sql: string): SqlClauses {
  const result: SqlClauses = { select: '', from: '', where: '', groupBy: '', orderBy: '' };
  const tokens = tokenize(sql);
  const upper = tokens.map(t => t.toUpperCase());

  let selectStart = -1, fromStart = -1, whereStart = -1, groupByStart = -1, orderByStart = -1;

  for (let i = 0; i < upper.length; i++) {
    if (upper[i] === 'SELECT' && selectStart === -1) selectStart = i + 1;
    else if (upper[i] === 'FROM' && fromStart === -1) fromStart = i + 1;
    else if (upper[i] === 'WHERE' && fromStart >= 0 && whereStart === -1) whereStart = i + 1;
    else if (upper[i] === 'GROUP' && i + 1 < upper.length && upper[i + 1] === 'BY') groupByStart = i + 2;
    else if (upper[i] === 'ORDER' && i + 1 < upper.length && upper[i + 1] === 'BY') orderByStart = i + 2;
  }

  // Two-token keywords need their start adjusted for boundary calculation
  const twoTokenStarts = [groupByStart, orderByStart].filter(s => s >= 0);

  const endOf = (start: number, ...boundaries: number[]): number => {
    const valid = boundaries.filter(b => b > start);
    const adjusted = valid.map(b => {
      // Two-token keywords (GROUP BY, ORDER BY): the actual keyword starts 2 tokens before
      if (twoTokenStarts.includes(b)) return b - 2;
      return b - 1;
    });
    return adjusted.length > 0 ? Math.min(...adjusted) : tokens.length;
  };

  if (selectStart >= 0) {
    const end = endOf(selectStart, fromStart);
    result.select = tokens.slice(selectStart, end).join(' ');
  }
  if (fromStart >= 0) {
    const end = endOf(fromStart, whereStart, groupByStart, orderByStart);
    result.from = tokens.slice(fromStart, end).join(' ');
  }
  if (whereStart >= 0) {
    const end = endOf(whereStart, groupByStart, orderByStart);
    result.where = tokens.slice(whereStart, end).join(' ');
  }
  if (groupByStart >= 0) {
    const end = endOf(groupByStart, orderByStart);
    result.groupBy = tokens.slice(groupByStart, end).join(' ');
  }
  if (orderByStart >= 0) {
    result.orderBy = tokens.slice(orderByStart).join(' ');
  }

  return result;
}

function tokenize(sql: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) { i++; continue; }

    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '"') j++;
      tokens.push(sql.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      tokens.push(sql.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (sql[i] === '(') {
      let j = i + 1;
      let depth = 1;
      while (j < sql.length && depth > 0) {
        if (sql[j] === '(') depth++;
        if (sql[j] === ')') depth--;
        j++;
      }
      if (tokens.length > 0 && /^[A-Za-z_]+$/.test(tokens[tokens.length - 1])) {
        tokens[tokens.length - 1] += sql.slice(i, j);
      } else {
        tokens.push(sql.slice(i, j));
      }
      i = j;
      continue;
    }

    if (sql[i] === '!' && sql[i + 1] === '=') { tokens.push('!='); i += 2; continue; }
    if (sql[i] === '<' || sql[i] === '>' || sql[i] === '=') {
      if (sql[i + 1] === '=') { tokens.push(sql.slice(i, i + 2)); i += 2; }
      else { tokens.push(sql[i]); i++; }
      continue;
    }
    if (sql[i] === ',' || sql[i] === '*') { tokens.push(sql[i]); i++; continue; }

    let j = i;
    while (j < sql.length && /[^\s"'(),!=<>*]/.test(sql[j])) j++;
    if (j > i) {
      tokens.push(sql.slice(i, j));
      i = j;
    } else {
      i++;
    }
  }
  return tokens;
}

// ─── Multi-metric SELECT parsing ───

function parseMultiMetricSelect(clause: string): MetricItem[] {
  // Split on commas that are outside of quoted strings and parentheses
  const items = splitMetricItems(clause);
  return items.map(parseMetricItem);
}

function splitMetricItems(clause: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let current = '';

  for (let i = 0; i < clause.length; i++) {
    const ch = clause[i];

    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }
    if (inSingle || inDouble) { current += ch; continue; }

    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }

    if (ch === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

function parseMetricItem(item: string): MetricItem {
  const trimmed = item.trim();

  // Extract AS "label" from the end
  const asMatch = trimmed.match(/\s+AS\s+["']([^"']+)["']\s*$/i);
  let label = 'Metric';
  let rest = trimmed;
  if (asMatch) {
    label = asMatch[1];
    rest = trimmed.slice(0, asMatch.index).trim();
  }

  // Extract WHERE condition (between aggregate and AS)
  let where: string | undefined;
  const whereMatch = rest.match(/^(.+?)\s+WHERE\s+(.+)$/i);
  let aggPart = rest;
  if (whereMatch) {
    aggPart = whereMatch[1].trim();
    where = whereMatch[2].trim();
  }

  // Parse aggregate
  const upper = aggPart.toUpperCase();
  let aggregate: AggregateType = 'count';
  let valueProperty: string | undefined;

  if (upper === 'COUNT(*)') {
    aggregate = 'count';
  } else {
    const sumMatch = aggPart.match(/^SUM\((.+)\)$/i);
    if (sumMatch) {
      aggregate = 'sum';
      valueProperty = unquoteIdent(sumMatch[1].trim());
    }
    const avgMatch = aggPart.match(/^AVG\((.+)\)$/i);
    if (avgMatch) {
      aggregate = 'average';
      valueProperty = unquoteIdent(avgMatch[1].trim());
    }
  }

  return { aggregate, valueProperty, where, label };
}

// ─── Single-metric SELECT parsing ───

const EXPRESSION_FUNCTIONS = ['dayssince', 'daysuntil', 'year', 'month', 'day'];

function parseSelectClause(clause: string, config: Partial<ChartConfig>): void {
  const trimmed = clause.trim();
  const upper = trimmed.toUpperCase();

  if (upper === 'COUNT(*)') {
    config.aggregate = 'count';
    return;
  }

  const sumMatch = trimmed.match(/^SUM\((.+)\)$/i);
  if (sumMatch) {
    config.aggregate = 'sum';
    config.valueProperty = unquoteIdent(sumMatch[1].trim());
    return;
  }

  const avgMatch = trimmed.match(/^AVG\((.+)\)$/i);
  if (avgMatch) {
    config.aggregate = 'average';
    config.valueProperty = unquoteIdent(avgMatch[1].trim());
    return;
  }

  // Function expression: daysSince(file.ctime), year(date), etc.
  const fnMatch = trimmed.match(/^(\w+)\((.+)\)$/);
  if (fnMatch && EXPRESSION_FUNCTIONS.includes(fnMatch[1].toLowerCase())) {
    config.valueExpression = trimmed;
    return;
  }

  // Two-field SELECT: "label, value" (per-note chart)
  const commaIdx = findTopLevelComma(trimmed);
  if (commaIdx >= 0) {
    config.labelProperty = unquoteIdent(trimmed.slice(0, commaIdx).trim());
    config.valueProperty = unquoteIdent(trimmed.slice(commaIdx + 1).trim());
    return;
  }

  config.labelProperty = unquoteIdent(trimmed);
}

function findTopLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')') depth--;
    if (s[i] === ',' && depth === 0) return i;
  }
  return -1;
}

// ─── ORDER BY parsing ───

function parseOrderByClause(clause: string, config: Partial<ChartConfig>): void {
  const parts = clause.trim().split(/\s+/);
  const field = (parts[0] || 'value').toLowerCase();
  const dir = (parts[1] || 'asc').toLowerCase();

  config.sort = {
    field: (field === 'label' ? 'label' : 'value') as SortField,
    direction: (dir === 'desc' ? 'desc' : 'asc') as SortDirection,
  };
}

// ─── FROM parsing (with multi-source support) ───

function parseFromClauseExtended(clause: string, config: Partial<ChartConfig>): void {
  const trimmed = clause.trim();

  if (trimmed.toLowerCase() === 'notes') return;

  // Check for UNION
  if (/\bUNION\b/i.test(trimmed)) {
    const parts = trimmed.split(/\s+UNION\s+/i).map(s => s.trim());
    const sources = parts.map(extractSourceName).filter(Boolean) as string[];
    if (sources.length > 1) {
      config.unionSources = sources;
      return;
    }
  }

  // Check for comma-separated sources
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(s => s.trim());
    const sources = parts.map(extractSourceName).filter(Boolean) as string[];
    if (sources.length > 1) {
      config.sources = sources;
      return;
    }
  }

  // Single source
  parseSingleFrom(trimmed, config);
}

function extractSourceName(s: string): string | null {
  const trimmed = s.trim();
  const quotedMatch = trimmed.match(/^"([^"]+)"$/);
  if (quotedMatch) return quotedMatch[1];
  if (trimmed.endsWith('.base')) return trimmed;
  return null;
}

function parseSingleFrom(trimmed: string, config: Partial<ChartConfig>): void {
  const quotedMatch = trimmed.match(/^"([^"]+)"$/);
  if (quotedMatch) {
    const inner = quotedMatch[1];
    const slashIdx = inner.indexOf('/');
    if (slashIdx >= 0 && inner.substring(0, slashIdx).includes('.base')) {
      config.source = inner.substring(0, slashIdx);
      config.view = inner.substring(slashIdx + 1);
    } else {
      config.source = inner;
    }
    return;
  }

  if (trimmed.endsWith('.base')) {
    config.source = trimmed;
  }
}

// ─── WHERE parsing ───

function parseWhereClause(clause: string, config: Partial<ChartConfig>): void {
  const conditions = splitOnKeyword(clause, 'AND');
  const tags: string[] = [];
  let folder: string | undefined;

  for (const cond of conditions) {
    const trimmed = cond.trim();
    if (!trimmed) continue;

    const tagsMatch = trimmed.match(/^tags\s+CONTAINS\s+'([^']*)'/i);
    if (tagsMatch) { tags.push(tagsMatch[1].replace(/''/g, "'")); continue; }

    const folderMatch = trimmed.match(/^folder\s*=\s*'([^']*)'/i);
    if (folderMatch) { folder = folderMatch[1].replace(/''/g, "'"); continue; }
  }

  if (tags.length > 0 || folder) {
    if (!config.query) config.query = {};
    if (tags.length > 0) config.query.tags = tags;
    if (folder) config.query.folder = folder;
  }
}

function splitOnKeyword(text: string, keyword: string): string[] {
  const result: string[] = [];
  const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const singleQuotes = (before.match(/'/g) || []).length;
    if (singleQuotes % 2 === 0) {
      result.push(text.slice(lastIdx, match.index));
      lastIdx = match.index + match[0].length;
    }
  }
  result.push(text.slice(lastIdx));
  return result;
}

function unquoteIdent(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}
