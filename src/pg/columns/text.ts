import { AnyTable, ColumnBuilder } from '../../core';
import { PgColumn } from '../core';

export class PgTextBuilder<
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends ColumnBuilder<
	PgText<string, TNotNull, TDefault>,
	TNotNull,
	TDefault
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgText<TTableName, TNotNull, TDefault> {
		return new PgText(table, this);
	}
}

export class PgText<
	TTableName extends string = string,
	TNotNull extends boolean = boolean,
	TDefault extends boolean = boolean,
> extends PgColumn<TTableName, string, TNotNull, TDefault> {
	constructor(
		table: AnyTable<TTableName>,
		builder: PgTextBuilder<TNotNull, TDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'text';
	}
}

export function text(name: string) {
	return new PgTextBuilder(name);
}
