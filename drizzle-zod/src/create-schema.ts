import { z } from 'zod';
import { Column, getTableColumns, getViewSelectedFields, is, isTable, SQL } from 'drizzle-orm';
import { columnToSchema } from './column';
import { isPgEnum, PgEnum } from 'drizzle-orm/pg-core';
import type { Table, View } from 'drizzle-orm';
import type { CreateInsertSchema, CreateSchemaFactoryOptions, CreateSelectSchema } from './types';

function getColumns(tableLike: Table | View) {
  return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

function handleColumns(
  columns: Record<string, any>,
  refinements: Record<string, any>,
  conditions: {
    never: (column?: Column) => boolean;
    optional: (column: Column) => boolean;
    nullable: (column: Column) => boolean;
  },
  factory?: CreateSchemaFactoryOptions
): z.ZodTypeAny {
  const columnSchemas: Record<string, z.ZodTypeAny> = {};

  for (const [key, selected] of Object.entries(columns)) {
    if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
      columnSchemas[key] = handleColumns(selected, refinements[key] ?? {}, conditions, factory);
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
    
    if (conditions.never(column)) {
      continue;
    } else {
      columnSchemas[key] = refined;
    };

    if (column) {
      if (conditions.nullable(column)) {
        columnSchemas[key] = columnSchemas[key]!.nullable();
      }

      if (conditions.optional(column)) {
        columnSchemas[key] = columnSchemas[key]!.optional();
      }
    }
  }

  return z.object(columnSchemas) as any;
}

function handleEnum(enum_: PgEnum<any>, factory?: CreateSchemaFactoryOptions) {
  const zod: typeof z = factory?.zodInstance ?? z;
  return zod.enum(enum_.enumValues);
}

const selectConditions = {
  never: () => false,
  optional: () => false,
  nullable: (column: Column) => !column.notNull
};

const insertConditions = {
  never: (column?: Column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
  optional: (column: Column) => !column.notNull || (column.notNull && column.hasDefault),
  nullable: (column: Column) => !column.notNull
}

export const createSelectSchema: CreateSelectSchema = (
  entity: Table | View | PgEnum<[string, ...string[]]>,
  refine?: Record<string, any>
) => {
  if (isPgEnum(entity)) {
    return handleEnum(entity);
  }
  const columns = getColumns(entity);
  return handleColumns(columns, refine ?? {}, selectConditions) as any;
}

export const createInsertSchema: CreateInsertSchema = (
  entity: Table,
  refine?: Record<string, any>
) => {
  const columns = getColumns(entity);
  return handleColumns(columns, refine ?? {}, insertConditions) as any;
}

export function createSchemaFactory(options?: CreateSchemaFactoryOptions) {
  const createSelectSchema: CreateSelectSchema = (
    entity: Table | View | PgEnum<[string, ...string[]]>,
    refine?: Record<string, any>
  ) => {
    if (isPgEnum(entity)) {
      return handleEnum(entity, options);
    }
    const columns = getColumns(entity);
    return handleColumns(columns, refine ?? {}, selectConditions, options) as any;
  }

  const createInsertSchema: CreateInsertSchema = (
    entity: Table,
    refine?: Record<string, any>
  ) => {
    const columns = getColumns(entity);
    return handleColumns(columns, refine ?? {}, insertConditions, options) as any;
  }

  return { createSelectSchema, createInsertSchema };
}
