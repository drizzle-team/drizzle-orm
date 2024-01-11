import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlTextBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MsSqlTextBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlText';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	generated: undefined;
}>;

export class MsSqlTextBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlText'>> extends MsSqlColumnBuilder<
	T,
	{ length: number | undefined; enumValues: T['enumValues']; nonUnicode: boolean }
> {
	static readonly [entityKind]: string = 'MsSqlTextBuilder';

	constructor(name: T['name'], config: MsSqlTextConfig<T['enumValues']> & { nonUnicode: boolean }) {
		super(name, 'string', 'MsSqlText');
		this.config.enumValues = config.enum;
		this.config.length = config.length;
		this.config.nonUnicode = config.nonUnicode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlText<MakeColumnConfig<T, TTableName>> {
		return new MsSqlText<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlText<T extends ColumnBaseConfig<'string', 'MsSqlText'>>
	extends MsSqlColumn<T, { length: number | undefined; enumValues: T['enumValues']; nonUnicode: boolean }>
{
	static readonly [entityKind]: string = 'MsSqlText';

	override readonly enumValues = this.config.enumValues;

	readonly length: number | undefined = this.config.length;

	readonly nonUnicode: boolean = this.config.nonUnicode;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlTextBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `${this.nonUnicode ? 'n' : ''}text${this.config.length ? `(${this.config.length})` : ''}`;
	}
}

export type MsSqlTextConfig<
	TEnum extends readonly string[] | string[] | undefined,
> = {
	length?: number;
	enum?: TEnum;
};

export function text<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: TName,
	config: MsSqlTextConfig<T | Writable<T>> = {},
): MsSqlTextBuilderInitial<TName, Writable<T>> {
	return new MsSqlTextBuilder(name, { ...config, nonUnicode: false });
}

export function nText<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: TName,
	config: MsSqlTextConfig<T | Writable<T>> = {},
): MsSqlTextBuilderInitial<TName, Writable<T>> {
	return new MsSqlTextBuilder(name, { ...config, nonUnicode: true });
}
