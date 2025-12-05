#!/usr/bin/env node
/**
 * SCHEMA.md 生成スクリプト（テーブルごとに整形・ENUM対応）
 *
 * 前提: table-info-production/ 配下に以下のCSVが存在
 *  - columns.csv       … 各列（schema, table, ordinal_position, column_name, data_type, udt_name, …, column_comment）
 *  - tables.csv        … 各テーブル（schema, table, table_comment, column_count）
 *  - constraints.csv   … 制約（schema, table, constraint_name, constraint_type）
 *  - indexes.csv       … インデックス（schema, table, index_name, index_def, is_unique, is_primary）
 *  - enums.csv         … ENUMの値一覧（schema_name, enum_type, enum_value, sort_order）
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const ROOT = path.resolve(process.cwd(), 'table-info-production');
const OUT  = path.join(ROOT, 'SCHEMA.md');

function readCsv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return [];
  const input = fs.readFileSync(p, 'utf8');
  return parse(input, {
    columns: true,
    skip_empty_lines: true
  });
}

// --- CSV 読み込み ---
const columns     = readCsv('columns.csv');
const tables      = readCsv('tables.csv');
const constraints = readCsv('constraints.csv');
const indexes     = readCsv('indexes.csv');
const enums       = readCsv('enums.csv');

// --- 安全パース用ヘルパ ---
const toInt   = (v, d = null) => (v === '' || v == null ? d : parseInt(v, 10));
const toBool  = (v) => (String(v).toLowerCase() === 'true');
const nn      = (v) => (v == null ? '' : String(v));

// --- ENUM マップ（型名 → 値配列） ---
//   注意: columns.udt_name はスキーマなしの型名が入る想定
//         衝突がなければ型名マップで十分。衝突がある場合は schema.type でも持つ。
const enumMapByType = new Map();              // 'payment_status' => ['unpaid', 'paid', ...]
const enumMapBySchemaType = new Map();        // 'public.payment_status' => [...]

for (const row of enums) {
  const schema = nn(row.schema_name);
  const type   = nn(row.enum_type);
  const value  = nn(row.enum_value);
  const key1   = type;
  const key2   = `${schema}.${type}`;
  if (!enumMapByType.has(key1)) enumMapByType.set(key1, []);
  if (!enumMapBySchemaType.has(key2)) enumMapBySchemaType.set(key2, []);
  enumMapByType.get(key1).push(value);
  enumMapBySchemaType.get(key2).push(value);
}

// --- テーブルごとに集約 ---
function key(schema, table) { return `${schema}.${table}`; }

const tableMeta = new Map(); // key(schema.table) => { schema, table, comment, columns:[], constraints:[], indexes:[] }

// 1) tables.csv（コメント等）
for (const t of tables) {
  const schema  = nn(t.table_schema);
  const name    = nn(t.table_name);
  const comment = nn(t.table_comment);
  tableMeta.set(key(schema, name), {
    schema,
    table: name,
    comment,
    columns: [],
    constraints: [],
    indexes: []
  });
}

// 2) columns.csv
//    ※ columns.csv に column_comment を含めるよう export SQL を拡張してあると理想。
//      もし無い場合は空欄で出力されます。
for (const c of columns) {
  const schema   = nn(c.table_schema);
  const table    = nn(c.table_name);
  const k        = key(schema, table);
  if (!tableMeta.has(k)) {
    tableMeta.set(k, { schema, table, comment: '', columns: [], constraints: [], indexes: [] });
  }
  tableMeta.get(k).columns.push({
    ordinal: toInt(c.ordinal_position, 0),
    name: nn(c.column_name),
    dataType: nn(c.data_type),
    udt: nn(c.udt_name),
    charLen: nn(c.character_maximum_length),
    numPrec: nn(c.numeric_precision),
    numScale: nn(c.numeric_scale),
    nullable: nn(c.is_nullable) === 'YES',
    default: nn(c.column_default),
    comment: nn(c.column_comment || c.comment || '')
  });
}

// 3) constraints.csv
for (const r of constraints) {
  const schema  = nn(r.table_schema);
  const table   = nn(r.table_name);
  const k       = key(schema, table);
  if (!tableMeta.has(k)) {
    tableMeta.set(k, { schema, table, comment: '', columns: [], constraints: [], indexes: [] });
  }
  tableMeta.get(k).constraints.push({
    name: nn(r.constraint_name),
    type: nn(r.constraint_type) // PRIMARY KEY | UNIQUE | FOREIGN KEY | CHECK ...
  });
}

// 4) indexes.csv
for (const ix of indexes) {
  const schema = nn(ix.table_schema);
  const table  = nn(ix.table_name);
  const k      = key(schema, table);
  if (!tableMeta.has(k)) {
    tableMeta.set(k, { schema, table, comment: '', columns: [], constraints: [], indexes: [] });
  }
  tableMeta.get(k).indexes.push({
    name: nn(ix.index_name),
    def: nn(ix.index_def),
    isUnique: toBool(ix.is_unique),
    isPrimary: toBool(ix.is_primary)
  });
}

// --- スキーマ→テーブルの並び順を決定（schema asc, table asc） ---
const groups = new Map(); // schema => [ tableMeta ]
for (const t of tableMeta.values()) {
  if (!groups.has(t.schema)) groups.set(t.schema, []);
  groups.get(t.schema).push(t);
}
for (const [s, arr] of groups.entries()) {
  arr.sort((a,b) => a.table.localeCompare(b.table));
}
const orderedSchemas = Array.from(groups.keys()).sort((a,b)=>a.localeCompare(b));

// --- Markdown 生成 ---
function fmtType(col) {
  if (col.dataType === 'USER-DEFINED') {
    const typeName = col.udt || '(user-defined)';
    const list1 = enumMapByType.get(typeName);
    const list2 = enumMapBySchemaType.get(`${col.schema}.${typeName}`);
    const enumValues = list2?.length ? list2 : list1;
    if (enumValues?.length) {
      return `\`${typeName}\` *(enum)*`;
    }
    return `\`${typeName}\``;
  }
  // 長さ/精度系の装飾
  if (col.dataType === 'character varying' && col.charLen) {
    return `\`varchar(${col.charLen})\``;
  }
  if (col.dataType === 'numeric' && (col.numPrec || col.numScale)) {
    const p = col.numPrec || '';
    const s = col.numScale || '';
    return s ? `\`numeric(${p},${s})\`` : `\`numeric(${p})\``;
  }
  return `\`${col.dataType}\``;
}

function renderColumnsTable(t) {
  const cols = t.columns
    .slice()
    .sort((a,b)=>a.ordinal - b.ordinal)
    .map((c, i) => {
      const typeStr = fmtType({ ...c, schema: t.schema });
      const nullStr = c.nullable ? 'YES' : 'NO';
      return `| ${c.ordinal} | \`${c.name}\` | ${typeStr} | ${nullStr} | ${nn(c.default)} | ${nn(c.comment)} |`;
    });
  if (!cols.length) return '_No columns_';
  return [
    '| # | Column | Type | NULL | Default | Comment |',
    '|---:|---|---|:---:|---|---|',
    ...cols
  ].join('\n');
}

function renderConstraints(t) {
  if (!t.constraints.length) return '_No constraints_';
  const grouped = t.constraints.reduce((acc, c) => {
    (acc[c.type] ||= []).push(c.name);
    return acc;
  }, {});
  const lines = [];
  for (const tp of Object.keys(grouped).sort()) {
    lines.push(`- **${tp}**: ${grouped[tp].map(n=>`\`${n}\``).join(', ')}`);
  }
  return lines.join('\n');
}

function renderIndexes(t) {
  if (!t.indexes.length) return '_No indexes_';
  return t.indexes
    .sort((a,b)=>a.name.localeCompare(b.name))
    .map(ix => {
      const badges = [
        ix.isPrimary ? '`PRIMARY`' : null,
        ix.isUnique ? '`UNIQUE`' : null
      ].filter(Boolean).join(' ');
      const head = `- \`${ix.name}\`${badges ? ' ' + badges : ''}`;
      const def  = ix.def ? `\n  \n  \`\`\`sql\n  ${ix.def}\n  \`\`\`` : '';
      return head + def;
    })
    .join('\n');
}

function renderEnumNoteIfAny(t) {
  // テーブル内で使っている ENUM 型を抽出し、値一覧を脚注的に表示
  const enumTypes = [];
  for (const c of t.columns) {
    if (c.dataType === 'USER-DEFINED' && c.udt) {
      const key1 = c.udt;
      const key2 = `${t.schema}.${c.udt}`;
      const vals = enumMapBySchemaType.get(key2) || enumMapByType.get(key1);
      if (vals?.length && !enumTypes.some(e => e.type === c.udt)) {
        enumTypes.push({ type: c.udt, values: vals });
      }
    }
  }
  if (!enumTypes.length) return '';
  return enumTypes.map(e =>
    `> **Enum \`${e.type}\` values**: ${e.values.map(v=>`\`${v}\``).join(', ')}`
  ).join('\n');
}

const now = new Date().toISOString();
let md = `# Database Schema (generated)\n\n> Generated at: ${now}\n\n---\n\n`;

for (const schema of orderedSchemas) {
  md += `## Schema: \`${schema}\`\n\n`;
  for (const t of groups.get(schema)) {
    md += `### \`${t.schema}.${t.table}\`\n\n`;
    if (t.comment) md += `${t.comment}\n\n`;
    md += `**Columns**\n\n${renderColumnsTable(t)}\n\n`;
    const enumNote = renderEnumNoteIfAny(t);
    if (enumNote) md += enumNote + '\n\n';
    md += `**Constraints**\n\n${renderConstraints(t)}\n\n`;
    md += `**Indexes**\n\n${renderIndexes(t)}\n\n`;
    md += `---\n\n`;
  }
}

// 参考: スキーマ全体で定義されている ENUM 型一覧（おまけ）
if (enums.length) {
  md += `## ENUM Types (global)\n\n`;
  const order = [...enumMapBySchemaType.entries()]
    .sort((a,b)=>a[0].localeCompare(b[0])); // schema.type ASC
  for (const [k, vals] of order) {
    md += `- \`${k}\`: ${vals.map(v=>`\`${v}\``).join(', ')}\n`;
  }
  md += '\n';
}

fs.writeFileSync(OUT, md, 'utf8');
console.log(`Wrote: ${OUT}`);