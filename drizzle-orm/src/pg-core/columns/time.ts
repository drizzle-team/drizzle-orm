import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBaseBuilder } from './date.common.ts';
import type { Precision } from './timestamp.ts';

export type PgTimeBuilderInitial<TName extends string> = PgTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgTime';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgTime'>> extends PgDateColumnBaseBuilder<
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgTimeBuilder';

	constructor(
		name: T['name'],
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string', 'PgTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTime<MakeColumnConfig<T, TTableName>> {
		return new PgTime<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgTime<T extends ColumnBaseConfig<'string', 'PgTime'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimeBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `time${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export type PgTemporalTimeBuilderInitial<TName extends string> = PgTemporalTimeBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgTemporalTime';
	data: Temporal.PlainTime;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTemporalTimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgTemporalTime'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgTemporalTimeBuilder';

	constructor(
		name: T['name'],
		readonly precision: number | undefined,
	) {
		super(name, 'date', 'PgTemporalTime');
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTemporalTime<MakeColumnConfig<T, TTableName>> {
		return new PgTemporalTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgTemporalTime<T extends ColumnBaseConfig<'date', 'PgTemporalTime'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgTemporalTime';

	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTemporalTimeBuilder<T>['config']) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `time${precision}`;
	}

	override mapFromDriverValue = (value: string): Temporal.PlainTime => {
		return Temporal.PlainTime.from(value);
	};

	override mapToDriverValue = (value: Temporal.PlainTime): string => {
		return value.toString();
	};
}

export interface TimeConfig<TMode extends 'string' | 'temporal' = 'string' | 'temporal'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function time(): PgTimeBuilderInitial<''>;
export function time<TMode extends TimeConfig['mode'] & {}>(
	config?: TimeConfig<TMode>,
): Equal<TMode, 'temporal'> extends true ? PgTemporalTimeBuilderInitial<''> : PgTimeBuilderInitial<''>;
export function time<TName extends string, TMode extends TimeConfig['mode'] & {}>(
	name: TName,
	config?: TimeConfig<TMode>,
): Equal<TMode, 'temporal'> extends true ? PgTemporalTimeBuilderInitial<TName> : PgTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b: TimeConfig = {}) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	if (config.mode === 'temporal') {
		if (config.withTimezone) {
			throw new DrizzleError({ message: 'Time with timezone is not supported in temporal mode' });
		}
		return new PgTemporalTimeBuilder(name, config.precision);
	}
	return new PgTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
