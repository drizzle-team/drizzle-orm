import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreDateBuilderInitial<TName extends string> = SingleStoreDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'SingleStoreDate';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'SingleStoreDate'>>
	extends SingleStoreColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SingleStoreDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'SingleStoreDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDate<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDate<T extends ColumnBaseConfig<'date', 'SingleStoreDate'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreDate';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export type SingleStoreDateStringBuilderInitial<TName extends string> = SingleStoreDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreDateString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreDateString'>>
	extends SingleStoreColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SingleStoreDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'SingleStoreDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDateString<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDateString<T extends ColumnBaseConfig<'string', 'SingleStoreDateString'>>
	extends SingleStoreColumn<T>
{
	static override readonly [entityKind]: string = 'SingleStoreDateString';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateStringBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}
}

export interface SingleStoreDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function date(): SingleStoreDateBuilderInitial<''>;
export function date<TMode extends SingleStoreDateConfig['mode'] & {}>(
	config?: SingleStoreDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateStringBuilderInitial<''> : SingleStoreDateBuilderInitial<''>;
export function date<TName extends string, TMode extends SingleStoreDateConfig['mode'] & {}>(
	name: TName,
	config?: SingleStoreDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateStringBuilderInitial<TName>
	: SingleStoreDateBuilderInitial<TName>;
export function date(a?: string | SingleStoreDateConfig, b?: SingleStoreDateConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDateConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new SingleStoreDateStringBuilder(name);
	}
	return new SingleStoreDateBuilder(name);
}
