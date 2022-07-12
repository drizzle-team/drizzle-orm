import { Column } from 'drizzle-orm';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { ParamValue } from 'drizzle-orm/sql';

export abstract class PgColumnBuilder<
	TColumnType extends AnyPgColumn = AnyPgColumn,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends ColumnBuilder<TColumnType, TNotNull, TDefault> {}

export abstract class PgColumn<
	TTable extends string,
	TType extends ParamValue = ParamValue,
	TNotNull extends boolean = boolean,
	TDefaultValue extends boolean = boolean,
> extends Column<TTable, TType, TNotNull, TDefaultValue> {}

export type AnyPgColumn<TTableName extends string = string> = PgColumn<TTableName>;
