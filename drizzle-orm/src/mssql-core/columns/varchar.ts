import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlVarCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MsSqlVarCharBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlVarChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		generated: undefined;
	}
>;

export type MsSqlVarCharJsonBuilderInitial<TName extends string> = MsSqlVarCharJsonBuilder<
	{
		name: TName;
		dataType: 'json';
		columnType: 'MsSqlNVarCharJson';
		data: unknown;
		driverParam: string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MsSqlVarCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlVarChar'>>
	extends MsSqlColumnBuilder<T, MsSqlVarCharConfig<'text', T['enumValues']>>
{
	static override readonly [entityKind]: string = 'MsSqlVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: MsSqlVarCharConfig<'text', T['enumValues']>) {
		super(name, 'string', 'MsSqlVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
		this.config.nonUnicode = config.nonUnicode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlVarChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MsSqlVarChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlVarChar<T extends ColumnBaseConfig<'string', 'MsSqlVarChar'>>
	extends MsSqlColumn<T, MsSqlVarCharConfig<'text', T['enumValues']>>
{
	static override readonly [entityKind]: string = 'MsSqlVarChar';

	readonly length: number | 'max' | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	readonly nonUnicode: boolean = this.config.nonUnicode;

	getSQLType(): string {
		return this.length === undefined
			? this.nonUnicode ? `nvarchar` : `varchar`
			: this.nonUnicode
			? `nvarchar(${this.length})`
			: `varchar(${this.length})`;
	}
}

export class MsSqlVarCharJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'MsSqlNVarCharJson'>>
	extends MsSqlColumnBuilder<T, { length: number | 'max' | undefined; nonUnicode: boolean }>
{
	static override readonly [entityKind]: string = 'MsSqlVarCharJsonBuilder';

	/** @internal */
	constructor(name: T['name'], config: { length: number | 'max' | undefined }) {
		super(name, 'json', 'MsSqlNVarCharJson');
		this.config.length = config.length;
		this.config.nonUnicode = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlVarCharJson<MakeColumnConfig<T, TTableName>> {
		return new MsSqlVarCharJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlVarCharJson<T extends ColumnBaseConfig<'json', 'MsSqlNVarCharJson'>>
	extends MsSqlColumn<T, { length: number | undefined; nonUnicode: boolean }>
{
	static override readonly [entityKind]: string = 'MsSqlVarCharJson';

	readonly length: number | 'max' | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined
			? `nvarchar`
			: `nvarchar(${this.length})`;
	}

	override mapFromDriverValue(value: string): T['data'] {
		return JSON.parse(value);
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export type MsSqlVarCharConfig<TMode extends 'text' | 'json', TEnum extends string[] | readonly string[] | undefined> =
	& MsSqlVarCharConfigInitial<TMode, TEnum>
	& {
		nonUnicode: boolean;
	};

export type MsSqlVarCharConfigInitial<
	TMode extends 'text' | 'json' = 'text' | 'json',
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
> = TMode extends 'text' ? {
		mode?: TMode;
		length?: number | 'max';
		enum?: TEnum;
	}
	: {
		mode?: TMode;
		length?: number | 'max';
	};

export function varchar(): MsSqlVarCharBuilderInitial<'', [string, ...string[]]>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlVarCharConfigInitial<'text', T | Writable<T>>,
): MsSqlVarCharBuilderInitial<'', Writable<T>>;
export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config?: MsSqlVarCharConfigInitial<'text', T | Writable<T>>,
): MsSqlVarCharBuilderInitial<TName, Writable<T>>;
export function varchar(
	a?: string | MsSqlVarCharConfigInitial<'text'>,
	b?: MsSqlVarCharConfigInitial<'text'>,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlVarCharConfigInitial<'text'>>(a, b);

	return new MsSqlVarCharBuilder(name, {
		...config,
		mode: 'text',
		nonUnicode: false,
	} as any);
}

export function nvarchar(): MsSqlVarCharBuilderInitial<'', [string, ...string[]]>;
export function nvarchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	config?: MsSqlVarCharConfigInitial<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? MsSqlVarCharJsonBuilderInitial<''>
	: MsSqlVarCharBuilderInitial<'', Writable<T>>;
export function nvarchar<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	name: TName,
	config?: MsSqlVarCharConfigInitial<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? MsSqlVarCharJsonBuilderInitial<''>
	: MsSqlVarCharBuilderInitial<'', Writable<T>>;
export function nvarchar(
	a?: string | MsSqlVarCharConfigInitial,
	b?: MsSqlVarCharConfigInitial,
): any {
	const { name, config } = getColumnNameAndConfig<MsSqlVarCharConfigInitial>(a, b);

	if (config?.mode === 'json') {
		return new MsSqlVarCharJsonBuilder(name, {
			length: config.length,
		});
	}

	return new MsSqlVarCharBuilder(name, {
		length: config?.length,
		enum: (config as any)?.enum,
		nonUnicode: true,
	});
}
