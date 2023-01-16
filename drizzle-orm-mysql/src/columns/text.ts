import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export type MySqlTextColumnType = 'tinytext' | 'text' | 'mediumtext' | 'longtext';

export class MySqlTextBuilder<
	TTextType extends MySqlTextColumnType = 'text',
	TData extends string = string,
> extends MySqlColumnBuilder<
	ColumnBuilderConfig<{
		data: TData;
		driverParam: number | string;
	}>,
	{ textType: TTextType }
> {
	constructor(
		name: string,
		textType: TTextType,
	) {
		super(name);
		this.config.textType = textType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlText<TTableName, TTextType, TData> {
		return new MySqlText(table, this.config);
	}
}

export class MySqlText<
	TTableName extends string,
	TTextType extends MySqlTextColumnType,
	TData extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: TData;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlText';
	private textType: TTextType;

	constructor(table: AnyMySqlTable<{ name: TTableName }>, config: MySqlTextBuilder<TTextType, TData>['config']) {
		super(table, config);
		this.textType = config.textType;
	}

	getSQLType(): string {
		return this.textType;
	}
}

export function text<T extends string = string>(name: string): MySqlTextBuilder<'text', T> {
	return new MySqlTextBuilder(name, 'text');
}

export function tinytext<T extends string = string>(name: string): MySqlTextBuilder<'tinytext', T> {
	return new MySqlTextBuilder(name, 'tinytext');
}

export function mediumtext<T extends string = string>(name: string): MySqlTextBuilder<'mediumtext', T> {
	return new MySqlTextBuilder(name, 'mediumtext');
}

export function longtext<T extends string = string>(name: string): MySqlTextBuilder<'longtext', T> {
	return new MySqlTextBuilder(name, 'longtext');
}
