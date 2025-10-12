\echo Exporting schema info CSVs...

-- Columns
\copy (
  SELECT
    n.nspname                 AS schema,
    c.relname                 AS table,
    a.attnum                  AS ordinal_position,
    a.attname                 AS column,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
    CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
    d.adsrc                   AS column_default,
    pgd.description           AS column_comment
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c     ON c.oid = a.attrelid AND c.relkind = 'r'
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = a.attrelid AND pgd.objsubid = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
    AND n.nspname NOT IN ('pg_catalog','information_schema')
  ORDER BY n.nspname, c.relname, a.attnum
) TO 'table-info/columns.csv' WITH CSV HEADER

-- Primary Keys
\copy (
  SELECT
    n.nspname AS schema,
    c.relname AS table,
    con.conname AS constraint_name,
    string_agg(a.attname, ', ' ORDER BY x.n) AS columns
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS x(attnum, n) ON TRUE
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.attnum
  WHERE con.contype = 'p'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
  GROUP BY n.nspname, c.relname, con.conname
  ORDER BY n.nspname, c.relname
) TO 'table-info/pks.csv' WITH CSV HEADER

-- Unique Constraints
\copy (
  SELECT
    n.nspname AS schema,
    c.relname AS table,
    con.conname AS constraint_name,
    string_agg(a.attname, ', ' ORDER BY x.n) AS columns
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS x(attnum, n) ON TRUE
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.attnum
  WHERE con.contype = 'u'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
  GROUP BY n.nspname, c.relname, con.conname
  ORDER BY n.nspname, c.relname
) TO 'table-info/uniques.csv' WITH CSV HEADER

-- Foreign Keys
\copy (
  SELECT
    sn.nspname AS src_schema,
    sc.relname AS src_table,
    con.conname AS constraint_name,
    string_agg(sa.attname, ', ' ORDER BY s_ord.n) AS src_columns,
    tn.nspname AS ref_schema,
    tc.relname AS ref_table,
    string_agg(ta.attname, ', ' ORDER BY t_ord.n) AS ref_columns,
    con.confupdtype AS on_update,
    con.confdeltype AS on_delete
  FROM pg_constraint con
  JOIN pg_class sc ON sc.oid = con.conrelid
  JOIN pg_namespace sn ON sn.oid = sc.relnamespace
  JOIN pg_class tc ON tc.oid = con.confrelid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  JOIN LATERAL unnest(con.conkey)  WITH ORDINALITY AS s(attnum, n)  ON TRUE
  JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS t(attnum, n)  ON TRUE
  JOIN LATERAL (SELECT s.n, t.n) AS s_ord ON s_ord.n = t.n
  JOIN LATERAL (SELECT s.n, t.n) AS t_ord ON t_ord.n = s.n
  JOIN pg_attribute sa ON sa.attrelid = sc.oid AND sa.attnum = s.attnum
  JOIN pg_attribute ta ON ta.attrelid = tc.oid AND ta.attnum = t.attnum
  WHERE con.contype = 'f'
    AND sn.nspname NOT IN ('pg_catalog','information_schema')
  GROUP BY sn.nspname, sc.relname, con.conname,
           tn.nspname, tc.relname, con.confupdtype, con.confdeltype
  ORDER BY src_schema, src_table, constraint_name
) TO 'table-info/fks.csv' WITH CSV HEADER

-- Indexes
\copy (
  SELECT
    n.nspname AS schema,
    c.relname AS table,
    i.relname AS index_name,
    pg_get_indexdef(ix.indexrelid) AS definition,
    ix.indisunique AS is_unique
  FROM pg_index ix
  JOIN pg_class c ON c.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  ORDER BY n.nspname, c.relname, i.relname
) TO 'table-info/indexes.csv' WITH CSV HEADER;

-- Check Constraints
\copy (
  SELECT
    n.nspname AS schema,
    c.relname AS table,
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid, true) AS definition
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE con.contype = 'c'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
  ORDER BY n.nspname, c.relname
) TO 'table-info/checks.csv' WITH CSV HEADER

-- Table Comments
\copy (
  SELECT
    n.nspname AS schema,
    c.relname AS table,
    d.description AS table_comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
  ORDER BY n.nspname, c.relname
) TO 'table-info/table_comments.csv' WITH CSV HEADER

\echo Done.