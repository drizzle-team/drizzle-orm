import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlDateBuilderInitial<TName extends string> = GoogleSqlDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GoogleSqlDate';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'GoogleSqlDate'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'GoogleSqlDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDate<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlDate<T extends ColumnBaseConfig<'date', 'GoogleSqlDate'>> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlDate';

	constructor(
		table: AnyGoogleSqlTable<{ name: T['tableName'] }>,
		config: GoogleSqlDateBuilder<T>['config'],
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

export type GoogleSqlDateStringBuilderInitial<TName extends string> = GoogleSqlDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlDateString';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlDateString'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'GoogleSqlDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDateString<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlDateString<T extends ColumnBaseConfig<'string', 'GoogleSqlDateString'>>
	extends GoogleSqlColumn<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlDateString';

	constructor(
		table: AnyGoogleSqlTable<{ name: T['tableName'] }>,
		config: GoogleSqlDateStringBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}
}

export interface GoogleSqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function date(): GoogleSqlDateBuilderInitial<''>;
export function date<TMode extends GoogleSqlDateConfig['mode'] & {}>(
	config?: GoogleSqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? GoogleSqlDateStringBuilderInitial<''> : GoogleSqlDateBuilderInitial<''>;
export function date<TName extends string, TMode extends GoogleSqlDateConfig['mode'] & {}>(
	name: TName,
	config?: GoogleSqlDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? GoogleSqlDateStringBuilderInitial<TName> : GoogleSqlDateBuilderInitial<TName>;
export function date(a?: string | GoogleSqlDateConfig, b?: GoogleSqlDateConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlDateConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new GoogleSqlDateStringBuilder(name);
	}
	return new GoogleSqlDateBuilder(name);
}
