import { z } from 'zod';
import { getTableColumns } from 'drizzle-orm';
import { columnToSchema } from './column';
import type { Table, View } from 'drizzle-orm';
import type { BuildTableSelectSchema, BuildViewSelectSchema } from './types';

// export function createSelectSchema<
// 	TView extends View
// >(
// 	view: TView
// ): z.ZodObject<BuildViewSelectSchema<TView>>
// export function createSelectSchema<
// 	TTable extends Table
// >(
// 	table: TTable
// ): z.ZodObject<BuildTableSelectSchema<TTable>>;
// export function createSelectSchema<
// 	TTableLike extends Table | View
// >(
// 	tableLike: TTableLike
// ) {
//   const columns = isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
//   let columnSchemas: Record<string, z.ZodTypeAny> = {};

//   for (const [key, column] of Object.entries(columns)) {
//     if (is(column, Column)) {
//       const schema = columnToSchema(column);
//       columnSchemas[key] = column.notNull ? schema : schema.nullable();
//     } else if (is(column, SQL)) {
//       column.
//     }
//   }

//   return z.object(columnSchemas) as any;
// }

export function createSelectSchema<
	TTable extends Table
>(
	table: TTable
): z.ZodObject<BuildTableSelectSchema<TTable>> {
  const columns = getTableColumns(table);
  let columnSchemas: Record<string, z.ZodTypeAny> = {};

  for (const [key, column] of Object.entries(columns)) {
    const schema = columnToSchema(column);
    columnSchemas[key] = column.notNull ? schema : schema.nullable();
  }

  return z.object(columnSchemas) as any;
}
