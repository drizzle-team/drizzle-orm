import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn } from './common.ts';
import { CockroachDbDateColumnBaseBuilder } from './date.common.ts';

export type CockroachDbTimestampBuilderInitial<TName extends string> = CockroachDbTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'CockroachDbTimestamp';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'CockroachDbTimestamp'>>
	extends CockroachDbDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'CockroachDbTimestampBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'date', 'CockroachDbTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbTimestamp<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbTimestamp<T extends ColumnBaseConfig<'date', 'CockroachDbTimestamp'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyCockroachDbTable<{ name: T['tableName'] }>, config: CockroachDbTimestampBuilder<T>['config']) {
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

export type CockroachDbTimestampStringBuilderInitial<TName extends string> = CockroachDbTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbTimestampString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbTimestampStringBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachDbTimestampString'>,
> extends CockroachDbDateColumnBaseBuilder<
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachDbTimestampStringBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'string', 'CockroachDbTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbTimestampString<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbTimestampString<T extends ColumnBaseConfig<'string', 'CockroachDbTimestampString'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(
		table: AnyCockroachDbTable<{ name: T['tableName'] }>,
		config: CockroachDbTimestampStringBuilder<T>['config'],
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

export interface CockroachDbTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp(): CockroachDbTimestampBuilderInitial<''>;
export function timestamp<TMode extends CockroachDbTimestampConfig['mode'] & {}>(
	config?: CockroachDbTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? CockroachDbTimestampStringBuilderInitial<''>
	: CockroachDbTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends CockroachDbTimestampConfig['mode'] & {}>(
	name: TName,
	config?: CockroachDbTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? CockroachDbTimestampStringBuilderInitial<TName>
	: CockroachDbTimestampBuilderInitial<TName>;
export function timestamp(a?: string | CockroachDbTimestampConfig, b: CockroachDbTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<CockroachDbTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new CockroachDbTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new CockroachDbTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
