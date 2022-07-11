import { Column } from 'drizzle-orm';
import { ColumnBuilder } from 'drizzle-orm/column-builder';
import { Primitive } from 'drizzle-orm/sql';

export abstract class PgColumnBuilder<
	TColumnType extends AnyColumn = AnyColumn,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends ColumnBuilder<TColumnType, TNotNull, TDefault> {}

export abstract class PgColumn<
	TTable extends string,
	TType extends Primitive = Primitive,
	TNotNull extends boolean = boolean,
	TDefaultValue extends boolean = boolean,
> extends Column<TTable, TType, TNotNull, TDefaultValue> {}

export type AnyColumn = Column<string>;
