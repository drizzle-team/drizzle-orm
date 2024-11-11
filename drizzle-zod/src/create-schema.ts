import { z } from 'zod';
import { Column, getTableColumns, getViewSelectedFields, is, isTable, SQL } from 'drizzle-orm';
import { columnToSchema } from './column';
import type { Table, View } from 'drizzle-orm';
import type { BuildRefine, BuildSelectSchema } from './types';

function createSelectColumns(columns: Record<string, any>, refinements: Record<string, any>): z.ZodTypeAny {
  const columnSchemas: Record<string, z.ZodTypeAny> = {};

  for (const [key, selected] of Object.entries(columns)) {
    if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
      columnSchemas[key] = createSelectColumns(selected, refinements[key] ?? {});
      continue;
    }

    const refinement = refinements[key];
    if (refinement !== undefined && typeof refinement !== 'function') {
      columnSchemas[key] = refinement;
      continue;
    }

    const column = is(selected, Column) ? selected : undefined;
    const schema = !!column ? columnToSchema(column) : z.any();
    const refined = typeof refinement === 'function' ? refinement(schema) : schema;
    columnSchemas[key] = !!column && !column.notNull ? refined.nullable() : refined;
  }

  return z.object(columnSchemas) as any;
}

export function createSelectSchema<TView extends View>(view: TView): BuildSelectSchema<TView['_']['selectedFields'], never>;
export function createSelectSchema<
  TView extends View,
  TRefine extends BuildRefine<TView['_']['selectedFields']>
>(
  view: TView,
  refine: TRefine
): BuildSelectSchema<TView['_']['selectedFields'], TRefine>;
export function createSelectSchema<TTable extends Table>(table: TTable): BuildSelectSchema<TTable['_']['columns'], never>;
export function createSelectSchema<
	TTable extends Table,
  TRefine extends BuildRefine<TTable['_']['columns']>
>(
	table: TTable,
  refine?: TRefine
): BuildSelectSchema<TTable['_']['columns'], TRefine>;
export function createSelectSchema(
	tableLike: Table | View,
  refine?: Record<string, any>
) {
  const columns = isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
  return createSelectColumns(columns, refine ?? {});
}
