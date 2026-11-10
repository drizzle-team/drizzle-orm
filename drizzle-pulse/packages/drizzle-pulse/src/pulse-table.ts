import type { InferModelFromColumns, InferSelectModel } from 'drizzle-orm';
import { getColumns } from 'drizzle-orm';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { PulseBuilder } from './server/pulse-builder.js';
import type {
  ColumnsSelection,
  PulseQueryConfig,
  PulseQueryContext,
  QueryFn,
} from './server/pulse-types.js';
import { getQualifiedTableName } from './shared/qualified-table-name.js';
import type { WhereClause } from './types.js';

const SUPPORTED_PK_SQL_TYPES = new Set([
  'smallint',
  'integer',
  'bigint',
  'smallserial',
  'serial',
  'bigserial',
  'text',
  'varchar',
  'character varying',
  'char',
  'character',
  'uuid',
]);

/**
 * Resolves the single primary-key column drizzle-pulse tracks a table by, from either an
 * inline `.primaryKey()` column or a table-extras `primaryKey({ columns: [...] })`
 * declaration. Exactly one PK column is required — a true composite (multiple columns) is
 * rejected — and its SQL type must be in the supported allowlist.
 */
export function getPulsePkColumn(table: PgTable): PgColumn {
  const columns = Object.values(getColumns(table)) as PgColumn[];
  const extrasPkNames = new Set(
    getTableConfig(table)
      .primaryKeys.flatMap((pk) => pk.columns)
      .map((c) => c.name),
  );
  const pkColumns = columns.filter((column) => column.primary || extrasPkNames.has(column.name));

  if (pkColumns.length === 0) {
    throw new Error(
      `Table "${getQualifiedTableName(table)}" has no primary key — declare one via .primaryKey() or primaryKey({ columns: [...] })`,
    );
  }

  if (pkColumns.length > 1) {
    throw new Error(`Table "${getQualifiedTableName(table)}" has multiple primary keys`);
  }

  const [pkColumn] = pkColumns;
  if (!pkColumn) {
    throw new Error(`Table "${getQualifiedTableName(table)}" has no resolvable primary key`);
  }

  const pkSqlType = pkColumn.getSQLType().toLowerCase();
  // getSQLType() includes length modifiers, e.g. "varchar(64)"
  const pkBaseSqlType = pkSqlType.replace(/\s*\(.*\)$/, '');
  if (!SUPPORTED_PK_SQL_TYPES.has(pkBaseSqlType)) {
    throw new Error(
      `Table "${getQualifiedTableName(table)}" primary key "${pkColumn.name}" has unsupported SQL type "${pkSqlType}". Supported types: ${Array.from(
        SUPPORTED_PK_SQL_TYPES,
      ).join(', ')}`,
    );
  }

  return pkColumn;
}

export class PulseTable<TTable extends PgTable = PgTable> {
  constructor(readonly table: TTable) {}

  /**
   * `ctx.args` is `any` here so `pulse(t).query(({ args }) => ...)` can read args before a
   * schema is chained; runtime-safe because `resolve()` substitutes `{}` for a schemaless
   * query. For fully-typed args, chain `pulse(t).args(schema).query(fn)`.
   */
  query(
    fn?: (
      ctx: PulseQueryContext<
        // biome-ignore lint/suspicious/noExplicitAny: permissive collection-level args, see comment above
        any,
        InferSelectModel<TTable>
      >,
    ) => WhereClause | null,
  ): PulseBuilder<
    TTable,
    Record<never, boolean>,
    Record<never, never>,
    ColumnsSelection<TTable, Record<never, boolean>>
  > {
    const columns = getColumns(this.table);
    const pkColumn = getPulsePkColumn(this.table);

    const config: PulseQueryConfig<
      TTable,
      Record<never, boolean>,
      Record<never, never>,
      ColumnsSelection<TTable, Record<never, boolean>>
    > = {
      table: {
        source: this.table,
      },
      pkColumn,
      columns,
      selectedColumns: columns,
      argsSchema: null,
      queryFn: (fn ?? null) as QueryFn<Record<never, never>, InferSelectModel<TTable>> | null,
      transformFn: null,
      order: null,
      limit: null,
    };

    return new PulseBuilder(config);
  }

  /** Start a builder chain with a typed args schema — `pulse(t).args(schema).query(fn)`. */
  args<TNewArgs>(schema: z.ZodType<TNewArgs>) {
    return this.query().args(schema);
  }

  /** Start a builder chain with a column selection. */
  columns<TNewSelection extends Record<string, boolean>>(selection: TNewSelection) {
    return this.query().columns(selection);
  }

  /** Start a builder chain with a sort direction. */
  order(direction: 'asc' | 'desc') {
    return this.query().order(direction);
  }

  /** Start a builder chain with a row limit. */
  limit(n: number) {
    return this.query().limit(n);
  }

  /** Start a builder chain with a row transform. */
  transform<TTransformed extends Record<string, unknown>>(
    fn: (
      rows: InferModelFromColumns<TTable['_']['columns']>[],
    ) => Promise<TTransformed[]> | TTransformed[],
  ) {
    return this.query().transform(fn);
  }
}

export function pulse<TTable extends PgTable>(table: TTable): PulseTable<TTable> {
  return new PulseTable(table);
}
