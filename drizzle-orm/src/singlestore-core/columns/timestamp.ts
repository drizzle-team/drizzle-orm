import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { sql } from '~/sql/sql.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
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
	static override readonly [entityKind]: string = 'SingleStoreTimestampBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'SingleStoreTimestamp');
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

	override defaultNow() {
		return this.default(sql`CURRENT_TIMESTAMP`);
	}
}

export class SingleStoreTimestamp<T extends ColumnBaseConfig<'date', 'SingleStoreTimestamp'>>
	extends SingleStoreDateBaseColumn<T, SingleStoreTimestampConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTimestamp';

	getSQLType(): string {
		return `timestamp`;
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
	static override readonly [entityKind]: string = 'SingleStoreTimestampStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'SingleStoreTimestampString');
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

	override defaultNow() {
		return this.default(sql`CURRENT_TIMESTAMP`);
	}
}

export class SingleStoreTimestampString<T extends ColumnBaseConfig<'string', 'SingleStoreTimestampString'>>
	extends SingleStoreDateBaseColumn<T, SingleStoreTimestampConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTimestampString';

	getSQLType(): string {
		return `timestamp`;
	}
}

export interface SingleStoreTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
}

export function timestamp(): SingleStoreTimestampBuilderInitial<''>;
export function timestamp<TMode extends SingleStoreTimestampConfig['mode'] & {}>(
	config?: SingleStoreTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreTimestampStringBuilderInitial<''>
	: SingleStoreTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends SingleStoreTimestampConfig['mode'] & {}>(
	name: TName,
	config?: SingleStoreTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreTimestampStringBuilderInitial<TName>
	: SingleStoreTimestampBuilderInitial<TName>;
export function timestamp(a?: string | SingleStoreTimestampConfig, b: SingleStoreTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new SingleStoreTimestampStringBuilder(name);
	}
	return new SingleStoreTimestampBuilder(name);
}
