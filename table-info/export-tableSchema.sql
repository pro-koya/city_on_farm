\set ON_ERROR_STOP on
\pset pager off

-- 必要なら環境に合わせて修正
\set outdir '/home/runner/work/city_on_farm/city_on_farm/table-info'

\echo Sanity check...
\copy (SELECT 1 AS a) TO /home/runner/work/city_on_farm/city_on_farm/table-info/hello.csv WITH (FORMAT csv, HEADER true)

\echo Exporting columns...
\copy (SELECT c.table_schema, c.table_name, c.ordinal_position, c.column_name, c.data_type, c.udt_name, c.character_maximum_length, c.numeric_precision, c.numeric_scale, c.is_nullable, c.column_default, pgd.description AS column_comment FROM information_schema.columns c LEFT JOIN pg_class cls ON cls.relname = c.table_name LEFT JOIN pg_namespace nsp ON nsp.nspname = c.table_schema AND nsp.oid = cls.relnamespace LEFT JOIN pg_attribute attr ON attr.attrelid = cls.oid AND attr.attname = c.column_name LEFT JOIN pg_description pgd ON pgd.objoid = cls.oid AND pgd.objsubid = attr.attnum WHERE c.table_schema NOT IN ('pg_catalog','information_schema') ORDER BY c.table_schema, c.table_name, c.ordinal_position) TO /home/runner/work/city_on_farm/city_on_farm/table-info/columns.csv WITH (FORMAT csv, HEADER true)

\echo Exporting tables...
\copy (SELECT t.table_schema, t.table_name, obj_description(('"'||t.table_schema||'"."'||t.table_name||'"')::regclass) AS table_comment, COUNT(c.column_name) AS column_count FROM information_schema.tables t LEFT JOIN information_schema.columns c ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE t.table_type = 'BASE TABLE' AND t.table_schema NOT IN ('pg_catalog','information_schema') GROUP BY t.table_schema, t.table_name ORDER BY t.table_schema, t.table_name) TO /home/runner/work/city_on_farm/city_on_farm/table-info/tables.csv WITH (FORMAT csv, HEADER true)

\echo Exporting constraints...
\copy (SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type FROM information_schema.table_constraints tc WHERE tc.table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3) TO /home/runner/work/city_on_farm/city_on_farm/table-info/constraints.csv WITH (FORMAT csv, HEADER true)

\echo Exporting indexes...
\copy (SELECT n.nspname AS table_schema, t.relname AS table_name, i.relname AS index_name, pg_get_indexdef(ix.indexrelid) AS index_def, ix.indisunique AS is_unique, ix.indisprimary AS is_primary FROM pg_class t JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND t.relkind = 'r' ORDER BY 1,2,3) TO /home/runner/work/city_on_farm/city_on_farm/table-info/indexes.csv WITH (FORMAT csv, HEADER true)

\echo Exporting enums...
\copy (SELECT n.nspname AS schema_name, t.typname AS enum_type, e.enumlabel AS enum_value, e.enumsortorder AS sort_order FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY n.nspname, t.typname, e.enumsortorder) TO /home/runner/work/city_on_farm/city_on_farm/table-info/enums.csv WITH (FORMAT csv, HEADER true)

\echo Done.