import { z } from 'zod';
import { Column, getTableColumns, getViewSelectedFields, is, isTable, SQL } from 'drizzle-orm';
import { columnToSchema } from './column';
import type { Table, View } from 'drizzle-orm';
import type { CreateSchemaFactoryOptions, CreateSelectSchema } from './types';

function getColumns(tableLike: Table | View) {
  return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

function createSelectColumns(columns: Record<string, any>, refinements: Record<string, any>, factory?: CreateSchemaFactoryOptions): z.ZodTypeAny {
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
    const schema = !!column ? columnToSchema(column, factory?.zodInstance ?? z) : z.any();
    const refined = typeof refinement === 'function' ? refinement(schema) : schema;
    columnSchemas[key] = !!column && !column.notNull ? refined.nullable() : refined;
  }

  return z.object(columnSchemas) as any;
}

export const createSelectSchema: CreateSelectSchema = (
  tableLike: Table | View,
  refine?: Record<string, any>
) => {
  const columns = getColumns(tableLike);
  return createSelectColumns(columns, refine ?? {}) as any;
}

export function createSchemaFactory(options?: CreateSchemaFactoryOptions) {
  const createSelectSchema: CreateSelectSchema = (
    tableLike: Table | View,
    refine?: Record<string, any>
  ) => {
    const columns = getColumns(tableLike);
    return createSelectColumns(columns, refine ?? {}, options) as any;
  }

  return { createSelectSchema };
}
