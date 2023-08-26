import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable } from '~/sqlite-core/table.ts';
import { type Writable } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = SQLiteTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SQLiteText';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
}>;

export class SQLiteTextBuilder<T extends ColumnBuilderBaseConfig<'string', 'SQLiteText'>> extends SQLiteColumnBuilder<
	T,
	{ length: number | undefined; enumValues: T['enumValues'] }
> {
	static readonly [entityKind]: string = 'SQLiteTextBuilder';

	constructor(name: T['name'], config: SQLiteTextConfig<T['enumValues']>) {
		super(name, 'string', 'SQLiteText');
		this.config.enumValues = config.enum;
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteText<MakeColumnConfig<T, TTableName>> {
		return new SQLiteText<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SQLiteText<T extends ColumnBaseConfig<'string', 'SQLiteText'>>
	extends SQLiteColumn<T, { length: number | undefined; enumValues: T['enumValues'] }>
{
	static readonly [entityKind]: string = 'SQLiteText';

	override readonly enumValues = this.config.enumValues;

	readonly length: number | undefined = this.config.length;

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteTextBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `text${this.config.length ? `(${this.config.length})` : ''}`;
	}
}

export interface SQLiteTextConfig<TEnum extends readonly string[] | string[] | undefined> {
	length?: number;
	enum?: TEnum;
}

export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: SQLiteTextConfig<T | Writable<T>> = {},
): SQLiteTextBuilderInitial<TName, Writable<T>> {
	return new SQLiteTextBuilder(name, config);
}
