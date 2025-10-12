-- table-info/export-tableSchema.sql
\set ON_ERROR_STOP on
\echo 'Exporting schema info CSVs...'

\copy (
  SELECT
    c.table_schema,
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale,
    c.is_nullable,
    c.column_default
  FROM information_schema.columns c
  WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
  ORDER BY c.table_schema, c.table_name, c.ordinal_position
) TO 'table-info/columns.csv' CSV HEADER

\copy (
  SELECT
    t.table_schema,
    t.table_name,
    obj_description(('"'||t.table_schema||'"."'||t.table_name||'"')::regclass) AS table_comment,
    COUNT(c.column_name) AS column_count
  FROM information_schema.tables t
  LEFT JOIN information_schema.columns c
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE t.table_type = 'BASE TABLE'
    AND t.table_schema NOT IN ('pg_catalog','information_schema')
  GROUP BY t.table_schema, t.table_name
  ORDER BY t.table_schema, t.table_name
) TO 'table-info/tables.csv' CSV HEADER

\copy (
  SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema NOT IN ('pg_catalog','information_schema')
  ORDER BY 1,2,3
) TO 'table-info/constraints.csv' CSV HEADER

\copy (
  SELECT
    n.nspname AS table_schema,
    t.relname AS table_name,
    i.relname AS index_name,
    pg_get_indexdef(ix.indexrelid) AS index_def,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary
  FROM pg_class t
  JOIN pg_index ix ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND t.relkind = 'r'
  ORDER BY 1,2,3
) TO 'table-info/indexes.csv' CSV HEADER