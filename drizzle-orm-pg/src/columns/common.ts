import { Column, InferColumnDriverType } from 'drizzle-orm';
import { ColumnBuilder } from 'drizzle-orm/column-builder';

export abstract class PgColumnBuilder<
	TColumnType extends AnyPgColumn,
	TDriverType,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends ColumnBuilder<TColumnType, TDriverType, TNotNull, TDefault> {}

export type AnyPgColumnBuilder = PgColumnBuilder<any, any, any, any>;

export abstract class PgColumn<
	TTable extends string,
	TType,
	TDriverType,
	TNotNull extends boolean,
	TDefaultValue extends boolean,
> extends Column<TTable, TType, TDriverType, TNotNull, TDefaultValue> {}

export type AnyPgColumn<
	TTableName extends string = string,
	TType = any,
	TDriverType = TType,
	TNotNull extends boolean = boolean,
	TDefaultValue extends boolean = boolean,
> = PgColumn<TTableName, TType, TDriverType, TNotNull, TDefaultValue>;
