import { z } from 'zod';
import { Column, getTableColumns, getViewSelectedFields, is, isTable, SQL } from 'drizzle-orm';
import { columnToSchema } from './column';
import type { Table, View } from 'drizzle-orm';
import type { BuildSelectSchema } from './types';

function createSelectColumns(columns: Record<string, any>): z.ZodTypeAny {
  const columnSchemas: Record<string, z.ZodTypeAny> = {};

  for (const [key, selected] of Object.entries(columns)) {
    if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
      columnSchemas[key] = createSelectColumns(selected);
      continue;
    }

    const column = is(selected, Column) ? selected : undefined;
    const schema = !!column ? columnToSchema(column) : z.any();
    columnSchemas[key] = (!!column && !column.notNull) ? schema.nullable() : schema;
  }

  return z.object(columnSchemas) as any;
}

export function createSelectSchema<
	TView extends View
>(
	view: TView
): BuildSelectSchema<TView['_']['selectedFields']>;
export function createSelectSchema<
	TTable extends Table
>(
	table: TTable
): BuildSelectSchema<TTable['_']['columns']>;
export function createSelectSchema<
	TTableLike extends Table | View
>(
	tableLike: TTableLike
) {
  const columns = isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
  return createSelectColumns(columns);
}
