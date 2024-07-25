import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/tables/common.ts';
import type { Equal } from '~/utils.ts';
import { SingleStoreDateBaseColumn, SingleStoreDateColumnBaseBuilder } from './date.common.ts';

export type SingleStoreTimestampBuilderInitial<TName extends string> = SingleStoreTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'SingleStoreTimestamp';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'SingleStoreTimestamp'>>
	extends SingleStoreDateColumnBaseBuilder<T, SingleStoreTimestampConfig>
{
	static readonly [entityKind]: string = 'SingleStoreTimestampBuilder';

	constructor(name: T['name'], config: SingleStoreTimestampConfig | undefined) {
		super(name, 'date', 'SingleStoreTimestamp');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreTimestamp<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreTimestamp<T extends ColumnBaseConfig<'date', 'SingleStoreTimestamp'>>
	extends SingleStoreDateBaseColumn<T, SingleStoreTimestampConfig>
{
	static readonly [entityKind]: string = 'SingleStoreTimestamp';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value + '+0000');
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

export type SingleStoreTimestampStringBuilderInitial<TName extends string> = SingleStoreTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreTimestampString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreTimestampStringBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'SingleStoreTimestampString'>,
> extends SingleStoreDateColumnBaseBuilder<T, SingleStoreTimestampConfig> {
	static readonly [entityKind]: string = 'SingleStoreTimestampStringBuilder';

	constructor(name: T['name'], config: SingleStoreTimestampConfig | undefined) {
		super(name, 'string', 'SingleStoreTimestampString');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreTimestampString<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreTimestampString<T extends ColumnBaseConfig<'string', 'SingleStoreTimestampString'>>
	extends SingleStoreDateBaseColumn<T, SingleStoreTimestampConfig>
{
	static readonly [entityKind]: string = 'SingleStoreTimestampString';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SingleStoreTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
	fsp?: TimestampFsp;
}

export function timestamp<TName extends string, TMode extends SingleStoreTimestampConfig['mode'] & {}>(
	name: TName,
	config?: SingleStoreTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreTimestampStringBuilderInitial<TName>
	: SingleStoreTimestampBuilderInitial<TName>;
export function timestamp(name: string, config: SingleStoreTimestampConfig = {}) {
	if (config.mode === 'string') {
		return new SingleStoreTimestampStringBuilder(name, config);
	}
	return new SingleStoreTimestampBuilder(name, config);
}
