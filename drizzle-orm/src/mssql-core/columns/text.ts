import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable, MsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlTextBuilder<TEnum extends [string, ...string[]]> extends MsSqlColumnBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	},
	{ enumValues: TEnum | undefined; nonUnicode: boolean }
> {
	static override readonly [entityKind]: string = 'MsSqlTextBuilder';

	constructor(name: string, config: MsSqlTextConfig<TEnum> & { nonUnicode: boolean }) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'MsSqlText');
		this.config.enumValues = config.enum;
		this.config.nonUnicode = config.nonUnicode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlText(table, this.config);
	}
}

export class MsSqlText<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends MsSqlColumn<T, { enumValues: T['enumValues'] | undefined; nonUnicode: boolean }>
{
	static override readonly [entityKind]: string = 'MsSqlText';

	override readonly enumValues = this.config.enumValues;

	readonly nonUnicode: boolean = this.config.nonUnicode;

	constructor(
		table: MsSqlTable<any>,
		config: MsSqlTextBuilder<[string, ...string[]]>['config'],
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

export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilder<Writable<T>>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilder<Writable<T>>;
export function text(
	a?: string | MsSqlTextConfig,
	b?: MsSqlTextConfig,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlTextConfig>(a, b);

	return new MsSqlTextBuilder(name, { ...config, nonUnicode: false } as any);
}

export function ntext<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilder<Writable<T>>;
export function ntext<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MsSqlTextConfig<T | Writable<T>>,
): MsSqlTextBuilder<Writable<T>>;
export function ntext(
	a?: string | MsSqlTextConfig,
	b?: MsSqlTextConfig,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlTextConfig>(a, b);

	return new MsSqlTextBuilder(name, { ...config, nonUnicode: true } as any);
}
