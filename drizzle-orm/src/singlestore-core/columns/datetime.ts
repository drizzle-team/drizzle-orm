import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { Equal } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreDateTimeBuilderInitial<TName extends string> = SingleStoreDateTimeBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'SingleStoreDateTime';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDateTimeBuilder<T extends ColumnBuilderBaseConfig<'date', 'SingleStoreDateTime'>>
	extends SingleStoreColumnBuilder<T, SingleStoreDatetimeConfig>
{
	static readonly [entityKind]: string = 'SingleStoreDateTimeBuilder';

	constructor(name: T['name'], config: SingleStoreDatetimeConfig | undefined) {
		super(name, 'date', 'SingleStoreDateTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDateTime<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDateTime<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDateTime<T extends ColumnBaseConfig<'date', 'SingleStoreDateTime'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreDateTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateTimeBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}

	override mapToDriverValue(value: Date): unknown {
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value.replace(' ', 'T') + 'Z');
	}
}

export type SingleStoreDateTimeStringBuilderInitial<TName extends string> = SingleStoreDateTimeStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreDateTimeString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDateTimeStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreDateTimeString'>>
	extends SingleStoreColumnBuilder<T, SingleStoreDatetimeConfig>
{
	static readonly [entityKind]: string = 'SingleStoreDateTimeStringBuilder';

	constructor(name: T['name'], config: SingleStoreDatetimeConfig | undefined) {
		super(name, 'string', 'SingleStoreDateTimeString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDateTimeString<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDateTimeString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDateTimeString<T extends ColumnBaseConfig<'string', 'SingleStoreDateTimeString'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreDateTimeString';

	readonly fsp: number | undefined;

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateTimeStringBuilder<T>['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `datetime${precision}`;
	}
}

export type DatetimeFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SingleStoreDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	fsp?: DatetimeFsp;
}

export function datetime<TName extends string, TMode extends SingleStoreDatetimeConfig['mode'] & {}>(
	name: TName,
	config?: SingleStoreDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateTimeStringBuilderInitial<TName>
	: SingleStoreDateTimeBuilderInitial<TName>;
export function datetime(name: string, config: SingleStoreDatetimeConfig = {}) {
	if (config.mode === 'string') {
		return new SingleStoreDateTimeStringBuilder(name, config);
	}
	return new SingleStoreDateTimeBuilder(name, config);
}
