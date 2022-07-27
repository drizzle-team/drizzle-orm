import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyMySqlTable } from '~/table';
import { MySqlColumnBuilder, MySqlColumnWithMapper } from './common';

export class MySqlTimestampBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<Date>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(
		name: string,
		public readonly fsp: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlTimestamp<TTableName, TNotNull, THasDefault> {
		return new MySqlTimestamp(table, this);
	}
}

export class MySqlTimestamp<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<TTableName, ColumnData<Date>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgTimestamp';

	public readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<TTableName>,
		builder: MySqlTimestampBuilder<TNotNull, THasDefault>,
	) {
		super(table, builder);
		this.fsp = builder.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? ` (${this.fsp})` : '';
		return `timestamp${precision}`;
	}

	override mapFromDriverValue = (value: ColumnDriverParam<string>): ColumnData<Date> => {
		return new Date(value) as ColumnData<Date>;
	};
}

export class MySqlTimestampStringBuilder<
	TNotNull extends ColumnNotNull = ColumnNotNull<false>,
	THasDefault extends ColumnHasDefault = ColumnHasDefault<false>,
> extends MySqlColumnBuilder<ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	constructor(
		name: string,
		public readonly fsp: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyMySqlTable<TTableName>,
	): MySqlTimestampString<TTableName, TNotNull, THasDefault> {
		return new MySqlTimestampString(table, this);
	}
}

export class MySqlTimestampString<
	TTableName extends TableName,
	TNotNull extends ColumnNotNull,
	THasDefault extends ColumnHasDefault,
> extends MySqlColumnWithMapper<TTableName, ColumnData<string>, ColumnDriverParam<string>, TNotNull, THasDefault> {
	protected brand!: 'PgTimestampString';

	public readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<TTableName>,
		builder: MySqlTimestampStringBuilder<TNotNull, THasDefault>,
	) {
		super(table, builder);
		this.fsp = builder.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? ` (${this.fsp})` : '';
		return `timestamp${precision}`;
	}
}

export type TimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> =
	& {
		fsp?: number;
	}
	& (
		| {
			mode: TMode;
		}
		| {
			mode?: TMode;
		}
	);

export function timestamp<TWithTZ extends boolean>(
	name: string,
	config?: TimestampConfig<'date'>,
): MySqlTimestampBuilder;
export function timestamp<TWithTZ extends boolean>(
	name: string,
	config: TimestampConfig<'string'>,
): MySqlTimestampStringBuilder;
export function timestamp(name: string, config?: TimestampConfig) {
	if (config?.mode === 'string') {
		return new MySqlTimestampStringBuilder(name, config.fsp);
	}
	return new MySqlTimestampBuilder(name, config?.fsp);
}
