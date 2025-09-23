import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlCharBuilder<TEnum extends [string, ...string[]]> extends MsSqlColumnBuilder<{
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
}, MsSqlCharConfig<TEnum>> {
	static override readonly [entityKind]: string = 'MsSqlCharBuilder';

	/** @internal */
	constructor(name: string, config: MsSqlCharConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'MsSqlChar');
		this.config.length = config.length ?? 1;
		this.config.enum = config.enum;
		this.config.nonUnicode = config.nonUnicode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlChar(
			table,
			this.config,
		);
	}
}

export class MsSqlChar<T extends ColumnBaseConfig<'string' | 'string enum'>>
	extends MsSqlColumn<T, MsSqlCharConfig<T['enumValues']>>
{
	static override readonly [entityKind]: string = 'MsSqlChar';

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

export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilder<Writable<T>>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilder<Writable<T>>;
export function char(
	a?: string | MsSqlCharConfigInitial,
	b?: MsSqlCharConfigInitial,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlCharConfigInitial>(a, b);

	return new MsSqlCharBuilder(name, { ...config, nonUnicode: false } as any);
}

export function nchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilder<Writable<T>>;
export function nchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MsSqlCharConfigInitial<T | Writable<T>>,
): MsSqlCharBuilder<Writable<T>>;
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
