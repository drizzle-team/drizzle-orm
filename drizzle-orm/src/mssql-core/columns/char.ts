import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MsSqlCharBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		generated: undefined;
	}
>;

export class MsSqlCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlChar'>>
	extends MsSqlColumnBuilder<T, MsSqlCharConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'MsSqlCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: MsSqlCharConfig<T['enumValues']>) {
		super(name, 'string', 'MsSqlChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
		this.config.nonUnicode = config.nonUnicode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MsSqlChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlChar<T extends ColumnBaseConfig<'string', 'MsSqlChar'>>
	extends MsSqlColumn<T, MsSqlCharConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'MsSqlChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	readonly nonUnicode: boolean = this.config.nonUnicode;

	getSQLType(): string {
		return this.length === undefined
			? this.nonUnicode ? `nchar` : `char`
			: this.nonUnicode
			? `nchar(${this.length})`
			: `char(${this.length})`;
	}
}

export type MsSqlCharConfig<TEnum extends string[] | readonly string[] | undefined> =
	& MsSqlCharConfigInitial<TEnum>
	& {
		nonUnicode: boolean;
	};

export type MsSqlCharConfigInitial<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
> = {
	length?: number;
	enum?: TEnum;
};

export function char(): MsSqlCharBuilderInitial<'', [string, ...string[]]>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilderInitial<'', Writable<T>>;
export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilderInitial<TName, Writable<T>>;
export function char(
	a?: string | MsSqlCharConfigInitial,
	b?: MsSqlCharConfigInitial,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlCharConfigInitial>(a, b);

	return new MsSqlCharBuilder(name, { ...config, nonUnicode: false } as any);
}

export function nchar(): MsSqlCharBuilderInitial<'', [string, ...string[]]>;
export function nchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilderInitial<'', Writable<T>>;
export function nchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilderInitial<TName, Writable<T>>;
export function nchar(
	a?: string | MsSqlCharConfigInitial,
	b?: MsSqlCharConfigInitial,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlCharConfigInitial>(a, b);
	return new MsSqlCharBuilder(name, {
		...config,
		nonUnicode: true,
	} as any);
}
