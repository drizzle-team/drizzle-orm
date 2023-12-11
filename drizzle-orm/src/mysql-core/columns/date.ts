import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { Equal } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlDateBuilderInitial<TName extends string> = MySqlDateBuilder<
	{
		name: TName;
		dataType: 'date';
		columnType: 'MySqlDate';
		data: Date;
		driverParam: string | number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'MySqlDate'>> extends MySqlColumnBuilder<T> {
	static readonly [entityKind]: string = 'MySqlDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'MySqlDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDate<MakeColumnConfig<T, TTableName>> {
		return new MySqlDate<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlDate<T extends ColumnBaseConfig<'date', 'MySqlDate'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlDate';

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateBuilder<T>['config'],
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

export type MySqlDateStringBuilderInitial<TName extends string> = MySqlDateStringBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlDateString';
		data: string;
		driverParam: string | number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlDateString'>>
	extends MySqlColumnBuilder<T>
{
	static readonly [entityKind]: string = 'MySqlDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'MySqlDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateString<MakeColumnConfig<T, TTableName>> {
		return new MySqlDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDateString<T extends ColumnBaseConfig<'string', 'MySqlDateString'>> extends MySqlColumn<T> {
	static readonly [entityKind]: string = 'MySqlDateString';

	constructor(
		table: AnyMySqlTable<{ name: T['tableName'] }>,
		config: MySqlDateStringBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}
}

export interface MySqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function date<TName extends string, TMode extends MySqlDateConfig['mode'] & {}>(
	name: TName,
	config?: MySqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? MySqlDateStringBuilderInitial<TName> : MySqlDateBuilderInitial<TName>;
export function date(name: string, config: MySqlDateConfig = {}) {
	if (config.mode === 'string') {
		return new MySqlDateStringBuilder(name);
	}
	return new MySqlDateBuilder(name);
}
