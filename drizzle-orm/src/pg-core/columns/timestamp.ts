import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume, type Equal } from '~/utils';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';

export interface PgTimestampBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgTimestampBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgTimestampHKT;
}

export interface PgTimestampHKT extends ColumnHKTBase {
	_type: PgTimestamp<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgTimestampBuilderInitial<TName extends string> = PgTimestampBuilder<{
	name: TName;
	data: Date;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgTimestampBuilder<T extends ColumnBuilderBaseConfig> extends PgDateColumnBaseBuilder<
	PgTimestampBuilderHKT,
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	static readonly [entityKind]: string = 'PgTimestampBuilder';

	constructor(
		name: string,
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name);
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTimestamp<MakeColumnConfig<T, TTableName>> {
		return new PgTimestamp<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgTimestamp<T extends ColumnBaseConfig> extends PgColumn<PgTimestampHKT, T> {
	static readonly [entityKind]: string = 'PgTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimestampBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue = (value: string): Date => {
		return new Date(this.withTimezone ? value : value + '+0000');
	};

	override mapToDriverValue = (value: Date): string => {
		return this.withTimezone ? value.toUTCString() : value.toISOString();
	};
}

export interface PgTimestampStringBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgTimestampStringBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgTimestampStringHKT;
}

export interface PgTimestampStringHKT extends ColumnHKTBase {
	_type: PgTimestampString<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgTimestampStringBuilderInitial<TName extends string> = PgTimestampStringBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgTimestampStringBuilder<T extends ColumnBuilderBaseConfig> extends PgDateColumnBaseBuilder<
	PgTimestampStringBuilderHKT,
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	static readonly [entityKind]: string = 'PgTimestampStringBuilder';

	constructor(
		name: string,
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name);
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTimestampString<MakeColumnConfig<T, TTableName>> {
		return new PgTimestampString<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgTimestampString<T extends ColumnBaseConfig> extends PgColumn<PgTimestampStringHKT, T> {
	static readonly [entityKind]: string = 'PgTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimestampStringBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PgTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp<TName extends string, TMode extends PgTimestampConfig['mode'] & {}>(
	name: TName,
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<TName> : PgTimestampBuilderInitial<TName>;
export function timestamp(
	name: string,
	config: PgTimestampConfig = {},
) {
	if (config.mode === 'string') {
		return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new PgTimestampBuilder(name, config.withTimezone ?? false, config.precision);
}
