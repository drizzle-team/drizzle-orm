import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';

import { AnyPgTable } from '~/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgRealBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends PgColumnBuilder<
	ColumnData<number>,
	ColumnDriverParam<string | number>,
	TNotNull,
	THasDefault
> {
	/** @internal */ length: number | undefined;

	constructor(name: string, length?: number) {
		super(name);
		this.length = length;
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgReal<TTableName, TNotNull, THasDefault> {
		return new PgReal(table, this);
	}
}

export class PgReal<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends PgColumn<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<string | number>,
	TNotNull,
	THasDefault
> {
	protected brand!: 'PgReal';

	constructor(
		table: AnyPgTable<TTableName>,
		builder: PgRealBuilder<TNotNull, THasDefault>,
	) {
		super(table, builder);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: ColumnDriverParam<string | number>): ColumnData<number> => {
		if (typeof value === 'string') {
			return parseFloat(value) as ColumnData<number>;
		}
		return value as ColumnData<any>;
	};
}

export function real(name: string) {
	return new PgRealBuilder(name);
}
