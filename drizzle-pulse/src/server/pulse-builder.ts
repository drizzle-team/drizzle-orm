import type { InferModelFromColumns, InferSelectModel } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { WhereClause } from '../types.js';
import type {
  ColumnsSelection,
  PulseQueryConfig,
  PulseQueryContext,
  QueryFn,
} from './pulse-types.js';

function columnsToSelectedColumns(
  selection: Record<string, boolean>,
  columns: Record<string, PgColumn>,
): Record<string, PgColumn> {
  const keys = Object.keys(selection);
  if (keys.length === 0) return columns;
  const columnEntries = Object.entries(columns);

  const hasInclude = keys.some((key) => selection[key] === true);
  if (hasInclude) {
    const includedColumnEntries = columnEntries.filter(([name]) => selection[name] === true);

    return Object.fromEntries(includedColumnEntries);
  }

  const remainingColumnEntries = columnEntries.filter(([name]) => selection[name] !== false);

  return Object.fromEntries(remainingColumnEntries);
}

export class PulseBuilder<
  TTable extends PgTable,
  TSelection extends Record<string, boolean>,
  TArgs,
  TResult extends Record<string, unknown> = ColumnsSelection<TTable, TSelection>,
> {
  readonly _!: {
    result: TResult;
  };

  readonly config: PulseQueryConfig<TTable, TSelection, TArgs, TResult>;

  constructor(config: PulseQueryConfig<TTable, TSelection, TArgs, TResult>) {
    this.config = config;
  }

  columns<TNewSelection extends Record<string, boolean>>(
    selection: TNewSelection,
  ): PulseBuilder<TTable, TNewSelection, TArgs, ColumnsSelection<TTable, TNewSelection>> {
    // A previously-chained .transform() was typed against the old TResult that .columns()
    // re-parameterizes; fail loudly rather than silently carry or drop it.
    if (this.config.transformFn !== null) {
      throw new Error(
        '.columns() cannot follow .transform(); call .columns() before .transform() instead',
      );
    }

    const selectedColumns = columnsToSelectedColumns(selection, this.config.columns);

    return new PulseBuilder<TTable, TNewSelection, TArgs, ColumnsSelection<TTable, TNewSelection>>({
      ...this.config,
      selectedColumns,
      transformFn: null,
    } as PulseQueryConfig<TTable, TNewSelection, TArgs, ColumnsSelection<TTable, TNewSelection>>);
  }

  args<TNewArgs>(schema: z.ZodType<TNewArgs>): PulseBuilder<TTable, TSelection, TNewArgs, TResult> {
    return new PulseBuilder<TTable, TSelection, TNewArgs, TResult>({
      ...this.config,
      argsSchema: schema,
      // The second QueryFn type param is the full source row type (PulseQueryConfig's
      // `queryFn: QueryFn<TArgs, InferSelectModel<TTable>>`), not the column-selection
      // map TSelection — the row shape doesn't change across .args(), only TArgs does.
      queryFn: this.config.queryFn as QueryFn<TNewArgs, InferSelectModel<TTable>> | null,
    } as unknown as PulseQueryConfig<TTable, TSelection, TNewArgs, TResult>);
  }

  transform<TTransformed extends Record<string, unknown>>(
    // Plain function type, not PulseTransformFn: the Bivariant wrapper blocks TTransformed
    // inference at the call site.
    fn: (
      rows: InferModelFromColumns<TTable['_']['columns']>[],
    ) => Promise<TTransformed[]> | TTransformed[],
  ): PulseBuilder<TTable, TSelection, TArgs, TTransformed> {
    return new PulseBuilder<TTable, TSelection, TArgs, TTransformed>({
      ...this.config,
      transformFn: fn,
    } as unknown as PulseQueryConfig<TTable, TSelection, TArgs, TTransformed>);
  }

  order(direction: 'asc' | 'desc'): PulseBuilder<TTable, TSelection, TArgs, TResult> {
    return new PulseBuilder<TTable, TSelection, TArgs, TResult>({
      ...this.config,
      order: direction,
    });
  }

  limit(n: number): PulseBuilder<TTable, TSelection, TArgs, TResult> {
    return new PulseBuilder<TTable, TSelection, TArgs, TResult>({ ...this.config, limit: n });
  }

  query(
    fn: (ctx: PulseQueryContext<TArgs, InferSelectModel<TTable>>) => WhereClause | null,
  ): PulseBuilder<TTable, TSelection, TArgs, TResult> {
    if (this.config.queryFn !== null) {
      throw new Error(
        '.query() may only be called once per chain; the where-function is already set',
      );
    }
    return new PulseBuilder<TTable, TSelection, TArgs, TResult>({ ...this.config, queryFn: fn });
  }
}
