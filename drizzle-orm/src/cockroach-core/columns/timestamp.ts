import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn } from './common.ts';
import { CockroachDateColumnBaseBuilder } from './date.common.ts';

export type CockroachTimestampBuilderInitial<TName extends string> = CockroachTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'CockroachTimestamp';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'CockroachTimestamp'>>
	extends CockroachDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'CockroachTimestampBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'date', 'CockroachTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachTimestamp<MakeColumnConfig<T, TTableName>> {
		return new CockroachTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachTimestamp<T extends ColumnBaseConfig<'date', 'CockroachTimestamp'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyCockroachTable<{ name: T['tableName'] }>, config: CockroachTimestampBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue = (value: string): Date | null => {
		return new Date(this.withTimezone ? value : value + '+0000');
	};

	override mapToDriverValue = (value: Date): string => {
		return value.toISOString();
	};
}

export type CockroachTimestampStringBuilderInitial<TName extends string> = CockroachTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachTimestampString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachTimestampStringBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachTimestampString'>,
> extends CockroachDateColumnBaseBuilder<
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachTimestampStringBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'string', 'CockroachTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachTimestampString<MakeColumnConfig<T, TTableName>> {
		return new CockroachTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachTimestampString<T extends ColumnBaseConfig<'string', 'CockroachTimestampString'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachTimestampStringBuilder<T>['config'],
	) {
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

export interface CockroachTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp(): CockroachTimestampBuilderInitial<''>;
export function timestamp<TMode extends CockroachTimestampConfig['mode'] & {}>(
	config?: CockroachTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? CockroachTimestampStringBuilderInitial<''>
	: CockroachTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends CockroachTimestampConfig['mode'] & {}>(
	name: TName,
	config?: CockroachTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? CockroachTimestampStringBuilderInitial<TName>
	: CockroachTimestampBuilderInitial<TName>;
export function timestamp(a?: string | CockroachTimestampConfig, b: CockroachTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new CockroachTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new CockroachTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
