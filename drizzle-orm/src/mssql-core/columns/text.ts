import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
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
	{ enumValues: T['enumValues']; nonUnicode: boolean }
> {
	static override readonly [entityKind]: string = 'MsSqlTextBuilder';

	constructor(name: T['name'], config: MsSqlTextConfig<T['enumValues']> & { nonUnicode: boolean }) {
		super(name, 'string', 'MsSqlText');
		this.config.enumValues = config.enum;
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
	extends MsSqlColumn<T, { enumValues: T['enumValues']; nonUnicode: boolean }>
{
	static override readonly [entityKind]: string = 'MsSqlText';

	override readonly enumValues = this.config.enumValues;

	readonly nonUnicode: boolean = this.config.nonUnicode;

	constructor(
		table: AnyMsSqlTable<{ name: T['tableName'] }>,
		config: MsSqlTextBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `${this.nonUnicode ? 'n' : ''}text`;
	}
}

export type MsSqlTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> = {
	enum?: TEnum;
};

export function text(): MsSqlTextBuilderInitial<'', [string, ...string[]]>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilderInitial<'', Writable<T>>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilderInitial<TName, Writable<T>>;
export function text(
	a?: string | MsSqlTextConfig,
	b?: MsSqlTextConfig,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlTextConfig>(a, b);

	return new MsSqlTextBuilder(name, { ...config, nonUnicode: false } as any);
}

export function ntext(): MsSqlTextBuilderInitial<'', [string, ...string[]]>;
export function ntext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilderInitial<'', Writable<T>>;
export function ntext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilderInitial<TName, Writable<T>>;
export function ntext(
	a?: string | MsSqlTextConfig,
	b?: MsSqlTextConfig,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlTextConfig>(a, b);

	return new MsSqlTextBuilder(name, { ...config, nonUnicode: true } as any);
}
