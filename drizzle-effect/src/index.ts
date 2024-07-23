import * as Schema from '@effect/schema/Schema';
import * as Drizzle from 'drizzle-orm';
import * as DrizzleMysql from 'drizzle-orm/mysql-core';
import * as DrizzlePg from 'drizzle-orm/pg-core';
import * as DrizzleSqlite from 'drizzle-orm/sqlite-core';

type Columns<TTable extends Drizzle.Table> =
  TTable['_']['columns'] extends infer TColumns extends Record<
    string,
    Drizzle.Column<any>
  >
    ? TColumns
    : never;

type PropertySignatureEncoded<T> = T extends Schema.PropertySignature<
  any,
  any,
  any,
  any,
  infer From,
  any,
  any
>
  ? From
  : never;

type PropertySignatureType<T> = T extends Schema.PropertySignature<
  any,
  infer To,
  any,
  any,
  any,
  any,
  any
>
  ? To
  : never;

type InsertRefineArg<
  TTable extends Drizzle.Table,
  Col extends keyof Columns<TTable>,
> =
  | Schema.Schema<any, any, any>
  | ((s: {
      [S in keyof InsertColumnPropertySignatures<TTable>]: InsertColumnPropertySignatures<TTable>[S] extends Schema.PropertySignature<
        any,
        any,
        any,
        any,
        any,
        any,
        any
      >
        ? Schema.Schema<
            Exclude<
              PropertySignatureEncoded<
                InsertColumnPropertySignatures<TTable>[S]
              >,
              undefined | null
            >,
            Exclude<
              PropertySignatureType<InsertColumnPropertySignatures<TTable>[S]>,
              undefined | null
            >
          >
        : InsertColumnPropertySignatures<TTable>[S];
    }) => InsertColumnPropertySignatures<TTable>[Col] extends Schema.PropertySignature<
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >
      ? Schema.Schema<
          Exclude<
            PropertySignatureEncoded<
              InsertColumnPropertySignatures<TTable>[Col]
            >,
            undefined | null
          >,
          any
        >
      : Schema.Schema<
          Exclude<
            Schema.Schema.Encoded<InsertColumnPropertySignatures<TTable>[Col]>,
            undefined | null
          >,
          any
        >);

type SelectRefineArg<
  TTable extends Drizzle.Table,
  Col extends keyof Columns<TTable>,
> =
  | Schema.Schema<any, any, any>
  | ((s: {
      [S in keyof InsertColumnPropertySignatures<TTable>]: InsertColumnPropertySignatures<TTable>[S] extends Schema.PropertySignature<
        any,
        any,
        any,
        any,
        any,
        any,
        any
      >
        ? Schema.Schema<
            Exclude<
              PropertySignatureEncoded<
                InsertColumnPropertySignatures<TTable>[S]
              >,
              undefined | null
            >,
            Exclude<
              PropertySignatureType<InsertColumnPropertySignatures<TTable>[S]>,
              undefined | null
            >
          >
        : InsertColumnPropertySignatures<TTable>[S];
    }) => InsertColumnPropertySignatures<TTable>[Col] extends Schema.PropertySignature<
      any,
      any,
      any,
      any,
      any,
      any,
      any
    >
      ? Schema.Schema<
          Exclude<
            PropertySignatureEncoded<
              InsertColumnPropertySignatures<TTable>[Col]
            >,
            undefined | null
          >,
          any
        >
      : Schema.Schema<
          Exclude<
            Schema.Schema.Encoded<InsertColumnPropertySignatures<TTable>[Col]>,
            undefined | null
          >,
          any
        >);

type InsertRefine<TTable extends Drizzle.Table> = {
  [K in keyof Columns<TTable>]?: InsertRefineArg<TTable, K>;
};

type SelectRefine<TTable extends Drizzle.Table> = {
  [K in keyof Columns<TTable>]?: SelectRefineArg<TTable, K>;
};

const literalSchema = Schema.Union(
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
);

type Json =
  | string
  | number
  | boolean
  | {
      [key: string]: Json;
    }
  | Json[]
  | readonly Json[]
  | null;

export const Json = Schema.suspend(
  (): Schema.Schema<Json> =>
    Schema.Union(
      literalSchema,
      Schema.Array(Json),
      Schema.Record({ key: Schema.String, value: Json })
    ),
);

type GetSchemaForType<TColumn extends Drizzle.Column> =
  TColumn['_']['dataType'] extends infer TDataType
    ? TDataType extends 'custom'
      ? Schema.Schema<any>
      : TDataType extends 'json'
      ? Schema.Schema<Json>
      : TColumn extends { enumValues: [string, ...string[]] }
      ? Drizzle.Equal<TColumn['enumValues'], [string, ...string[]]> extends true
        ? Schema.Schema<string>
        : Schema.Schema<TColumn['enumValues'][number]>
      : TDataType extends 'array'
      ? Schema.Schema<
          | null
          | readonly Drizzle.Assume<
              TColumn['_'],
              { baseColumn: Drizzle.Column }
            >['baseColumn']['_']['data'][]
        >
      : TDataType extends 'bigint'
      ? Schema.Schema<bigint>
      : TDataType extends 'number'
      ? Schema.Schema<number>
      : TDataType extends 'string'
      ? Schema.Schema<string>
      : TDataType extends 'boolean'
      ? Schema.Schema<boolean>
      : TDataType extends 'date'
      ? Schema.Schema<Date>
      : Schema.Schema<any>
    : never;

type MapInsertColumnToPropertySignature<TColumn extends Drizzle.Column> =
  TColumn['_']['notNull'] extends false
    ? Schema.PropertySignature<
        '?:',
        Schema.Schema.Type<GetSchemaForType<TColumn>> | undefined | null,
        TColumn['_']['name'],
        '?:',
        Schema.Schema.Encoded<GetSchemaForType<TColumn>> | undefined | null,
        false,
        never
      >
    : TColumn['_']['hasDefault'] extends true
    ? Schema.PropertySignature<
        '?:',
        Schema.Schema.Type<GetSchemaForType<TColumn>> | undefined,
        TColumn['_']['name'],
        '?:',
        Schema.Schema.Encoded<GetSchemaForType<TColumn>> | undefined,
        true,
        never
      >
    : GetSchemaForType<TColumn>;

type MapSelectColumnToPropertySignature<TColumn extends Drizzle.Column> =
  TColumn['_']['notNull'] extends false
    ? Schema.Schema<Schema.Schema.Type<GetSchemaForType<TColumn>> | null>
    : GetSchemaForType<TColumn>;

type InsertColumnPropertySignatures<TTable extends Drizzle.Table> = {
  [K in keyof Columns<TTable>]: MapInsertColumnToPropertySignature<
    Columns<TTable>[K]
  >;
};

type SelectColumnPropertySignatures<TTable extends Drizzle.Table> = {
  [K in keyof Columns<TTable>]: MapSelectColumnToPropertySignature<
    Columns<TTable>[K]
  >;
};

type PropertySignatureReplaceType<S, ReplaceWith> =
  S extends Schema.PropertySignature<
    infer TokenType,
    any,
    infer Name,
    infer TokenEncoded,
    infer Encoded,
    infer HasDefault,
    infer R
  >
    ? Schema.PropertySignature<
        TokenType,
        ReplaceWith,
        Name,
        TokenEncoded,
        Encoded,
        HasDefault,
        R
      >
    : never;

type CarryOverNull<From, To> = null extends From ? To | null : To;
type CarryOverUndefined<From, To> = undefined extends From
  ? To | undefined
  : To;

type CarryOverOptionality<From, To> = CarryOverNull<
  From,
  CarryOverUndefined<From, To>
>;

type BuildInsertSchema<
  TTable extends Drizzle.Table,
  TRefine extends InsertRefine<TTable> | {} = {},
> = Schema.Struct<
  InsertColumnPropertySignatures<TTable> & {
    [K in keyof TRefine &
      string]: InsertColumnPropertySignatures<TTable>[K] extends Schema.PropertySignature<
      any,
      any,
      any,
      any,
      any,
      any
    >
      ? TRefine[K] extends Schema.Schema<any, any, any>
        ? Schema.Schema<
            CarryOverOptionality<
              PropertySignatureType<InsertColumnPropertySignatures<TTable>[K]>,
              Schema.Schema.Type<TRefine[K]>
            >
          >
        : TRefine[K] extends (...a: any[]) => any
        ? PropertySignatureReplaceType<
            InsertColumnPropertySignatures<TTable>[K],
            CarryOverOptionality<
              PropertySignatureType<InsertColumnPropertySignatures<TTable>[K]>,
              Schema.Schema.Type<ReturnType<TRefine[K]>>
            >
          >
        : never
      : TRefine[K];
  }
>;

type BuildSelectSchema<
  TTable extends Drizzle.Table,
  TRefine extends InsertRefine<TTable> | {} = {},
> = Schema.Struct<
  {
    [K in keyof SelectColumnPropertySignatures<TTable>]: SelectColumnPropertySignatures<TTable>[K];
  } & {
    [K in keyof TRefine &
      string]: SelectColumnPropertySignatures<TTable>[K] extends Schema.PropertySignature<
      any,
      any,
      any,
      any,
      any,
      any
    >
      ? TRefine[K] extends Schema.Schema<any, any, any>
        ? Schema.Schema<
            CarryOverOptionality<
              PropertySignatureType<SelectColumnPropertySignatures<TTable>[K]>,
              Schema.Schema.Type<TRefine[K]>
            >
          >
        : TRefine[K] extends (...a: any[]) => any
        ? PropertySignatureReplaceType<
            SelectColumnPropertySignatures<TTable>[K],
            CarryOverOptionality<
              PropertySignatureType<SelectColumnPropertySignatures<TTable>[K]>,
              Schema.Schema.Type<ReturnType<TRefine[K]>>
            >
          >
        : never
      : TRefine[K];
  }
>;

export function createInsertSchema<
  TTable extends Drizzle.Table,
  TRefine extends InsertRefine<TTable>,
>(
  table: TTable,
  refine?: {
    [K in keyof TRefine]: K extends keyof TTable['_']['columns']
      ? TRefine[K]
      : Drizzle.DrizzleTypeError<`Column '${K &
          string}' does not exist in table '${TTable['_']['name']}'`>;
  },
): BuildInsertSchema<
  TTable,
  Drizzle.Equal<TRefine, InsertRefine<TTable>> extends true ? {} : TRefine
> {
  const columns = Drizzle.getTableColumns(table);
  const columnEntries = Object.entries(columns);

  let schemaEntries = Object.fromEntries(
    columnEntries.map(([name, column]) => {
      return [name, mapColumnToSchema(column)];
    }),
  );

  if (refine) {
    schemaEntries = Object.assign(
      schemaEntries,
      Object.fromEntries(
        Object.entries(refine).map(([name, refineColumn]) => {
          return [
            name,
            typeof refineColumn === 'function' &&
            !(Schema.isSchema(refineColumn))
              ? refineColumn(schemaEntries as any)
              : refineColumn,
          ];
        }),
      ),
    );
  }

  for (const [name, column] of columnEntries) {
    if (!column.notNull) {
      schemaEntries[name] = Schema.optional(
        Schema.NullOr(schemaEntries[name]!),
      ) as any;
    } else if (column.hasDefault) {
      schemaEntries[name] = Schema.optional(schemaEntries[name]!) as any;
    }
  }

  return Schema.Struct(schemaEntries) as any;
}

export function createSelectSchema<
  TTable extends Drizzle.Table,
  TRefine extends SelectRefine<TTable>,
>(
  table: TTable,
  refine?: {
    [K in keyof TRefine]: K extends keyof TTable['_']['columns']
      ? TRefine[K]
      : Drizzle.DrizzleTypeError<`Column '${K &
          string}' does not exist in table '${TTable['_']['name']}'`>;
  },
): BuildSelectSchema<
  TTable,
  Drizzle.Equal<TRefine, SelectRefine<TTable>> extends true ? {} : TRefine
> {
  const columns = Drizzle.getTableColumns(table);
  const columnEntries = Object.entries(columns);

  let schemaEntries = Object.fromEntries(
    columnEntries.map(([name, column]) => {
      return [name, mapColumnToSchema(column)];
    }),
  );

  if (refine) {
    schemaEntries = Object.assign(
      schemaEntries,
      Object.fromEntries(
        Object.entries(refine).map(([name, refineColumn]) => {
          return [
            name,
            typeof refineColumn === 'function' &&
            !(Schema.isSchema(refineColumn))
              ? refineColumn(schemaEntries as any)
              : refineColumn,
          ];
        }),
      ),
    );
  }

  for (const [name, column] of columnEntries) {
    if (!column.notNull) {
      schemaEntries[name] = Schema.NullOr(schemaEntries[name]!);
    }
  }

  return Schema.Struct(schemaEntries) as any;
}

function mapColumnToSchema(column: Drizzle.Column): Schema.Schema<any, any> {
  let type: Schema.Schema<any, any> | undefined;

  if (isWithEnum(column)) {
    type = column.enumValues.length
      ? Schema.Literal(...column.enumValues)
      : Schema.String;
  }

  if (!type) {
    if (Drizzle.is(column, DrizzlePg.PgUUID)) {
      type = Schema.UUID;
    } else if (column.dataType === 'custom') {
      type = Schema.Any;
    } else if (column.dataType === 'json') {
      type = Json;
    } else if (column.dataType === 'array') {
      type = Schema.Array(
        mapColumnToSchema((column as DrizzlePg.PgArray<any, any>).baseColumn),
      );
    } else if (column.dataType === 'number') {
      type = Schema.Number;
    } else if (column.dataType === 'bigint') {
      type = Schema.BigIntFromSelf;
    } else if (column.dataType === 'boolean') {
      type = Schema.Boolean;
    } else if (column.dataType === 'date') {
      type = Schema.DateFromSelf;
    } else if (column.dataType === 'string') {
      let sType = Schema.String;

      if (
        (Drizzle.is(column, DrizzlePg.PgChar) ||
          Drizzle.is(column, DrizzlePg.PgVarchar) ||
          Drizzle.is(column, DrizzleMysql.MySqlVarChar) ||
          Drizzle.is(column, DrizzleMysql.MySqlVarBinary) ||
          Drizzle.is(column, DrizzleMysql.MySqlChar) ||
          Drizzle.is(column, DrizzleSqlite.SQLiteText)) &&
        typeof column.length === 'number'
      ) {
        sType = sType.pipe(Schema.maxLength(column.length));
      }

      type = sType;
    }
  }

  if (!type) {
    type = Schema.Any;
  }

  return type;
}

function isWithEnum(
  column: Drizzle.Column,
): column is typeof column & { enumValues: [string, ...string[]] } {
  return (
    'enumValues' in column &&
    Array.isArray(column.enumValues) &&
    column.enumValues.length > 0
  );
}
