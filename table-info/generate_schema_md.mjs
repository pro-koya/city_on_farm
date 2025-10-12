// Node 18+ (ESM)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // table-info ディレクトリ

function parseCSV(text) {
  const rows = [];
  let i = 0, cur = '', inQ = false, row = [];
  while (i < text.length) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      } else { cur += ch; i++; continue; }
    } else {
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ',') { row.push(cur); cur = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += ch; i++; continue;
    }
  }
  row.push(cur); rows.push(row);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).filter(r => r.length === header.length).map(r => {
    const o = {};
    header.forEach((h, idx) => { o[h] = r[idx]; });
    return o;
  });
}

function readCSVLocal(filename) {
  const p = path.join(ROOT, filename);
  if (!fs.existsSync(p)) return [];
  const txt = fs.readFileSync(p, 'utf8');
  if (!txt.trim()) return [];
  return parseCSV(txt);
}

function key(schema, table) { return `${schema}.${table}`; }
function groupByTable(records, schemaField='schema', tableField='table') {
  const map = new Map();
  for (const r of records) {
    const k = key(r[schemaField], r[tableField]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}
const mdEscape = (s='') => String(s).replace(/\|/g, '\\|');

function render() {
  const columns = readCSVLocal('columns.csv');
  const pks     = readCSVLocal('pks.csv');
  const uniques = readCSVLocal('uniques.csv');
  const fks     = readCSVLocal('fks.csv');
  const idxs    = readCSVLocal('indexes.csv');
  const checks  = readCSVLocal('checks.csv');
  const tcom    = readCSVLocal('table_comments.csv');

  const colByTbl = groupByTable(columns);
  const pkByTbl  = groupByTable(pks);
  const ukByTbl  = groupByTable(uniques);
  const fkByTbl  = groupByTable(fks, 'src_schema', 'src_table');
  const ixByTbl  = groupByTable(idxs);
  const ckByTbl  = groupByTable(checks);
  const tcByTbl  = groupByTable(tcom);

  const tables = [...colByTbl.keys()].sort((a,b)=>a.localeCompare(b));

  let out = '';
  out += '# Database Schema (generated)\n\n';
  out += `> Generated at: ${new Date().toISOString()}\n\n`;
  out += '---\n\n';

  const bySchema = new Map();
  tables.forEach(k => {
    const [schema] = k.split('.');
    if (!bySchema.has(schema)) bySchema.set(schema, []);
    bySchema.get(schema).push(k);
  });

  for (const [schema, tblKeys] of [...bySchema.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
    out += `## Schema: \`${schema}\`\n\n`;
    for (const k of tblKeys) {
      const [sc, tb] = k.split('.');
      out += `### \`${sc}.${tb}\`\n\n`;

      const tcomRows = tcByTbl.get(key(sc, tb)) || [];
      const comment = tcomRows[0]?.table_comment;
      if (comment) out += `${comment}\n\n`;

      out += '**Columns**\n\n';
      out += '| # | Column | Type | NULL | Default | Comment |\n';
      out += '|---:|---|---|:---:|---|---|\n';
      const cols = (colByTbl.get(k) || []).sort((a,b)=>Number(a.ordinal_position)-Number(b.ordinal_position));
      for (const c of cols) {
        out += `| ${c.ordinal_position} | \`${mdEscape(c.column)}\` | \`${mdEscape(c.data_type)}\` | ${c.is_nullable==='NO'?'NO':'YES'} | ${mdEscape(c.column_default||'')} | ${mdEscape(c.column_comment||'')} |\n`;
      }
      out += '\n';

      const pkRows = pkByTbl.get(k) || [];
      const ukRows = ukByTbl.get(k) || [];
      const fkRows = fkByTbl.get(k) || [];
      const ckRows = ckByTbl.get(k) || [];

      if (pkRows.length || ukRows.length || fkRows.length || ckRows.length) {
        out += '**Constraints**\n\n';
        if (pkRows.length)  pkRows.forEach(r => out += `- PK \`${r.constraint_name}\`: (${r.columns})\n`);
        if (ukRows.length)  ukRows.forEach(r => out += `- UNIQUE \`${r.constraint_name}\`: (${r.columns})\n`);
        if (fkRows.length)  fkRows.forEach(r => out += `- FK \`${r.constraint_name}\`: (${r.src_columns}) → \`${r.ref_schema}.${r.ref_table}\` (${r.ref_columns})  _on update: ${r.on_update}, on delete: ${r.on_delete}_\n`);
        if (ckRows.length)  ckRows.forEach(r => out += `- CHECK \`${r.constraint_name}\`: ${r.definition}\n`);
        out += '\n';
      }

      const ixRows = ixByTbl.get(k) || [];
      if (ixRows.length) {
        out += '**Indexes**\n\n';
        ixRows.forEach(r => out += `- \`${r.index_name}\`${r.is_unique === 't' ? ' (UNIQUE)' : ''}: \`${r.definition}\`\n`);
        out += '\n';
      }

      out += '---\n\n';
    }
  }

  fs.writeFileSync(path.join(ROOT, 'SCHEMA.md'), out, 'utf8');
  console.log('✅ table-info/SCHEMA.md を生成しました');
}

render();