import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlVarCharBuilder<TEnum extends [string, ...string[]]> extends MsSqlColumnBuilder<{
	dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
}, MsSqlVarCharConfig<'text', TEnum> & { rawLength: number | 'max' | undefined }> {
	static override readonly [entityKind]: string = 'MsSqlVarCharBuilder';

	/** @internal */
	constructor(name: string, config: MsSqlVarCharConfig<'text', TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'MsSqlVarChar');
		this.config.length = typeof config?.length === 'number' ? config.length : config?.length === 'max' ? 2147483647 : 1;
		this.config.rawLength = config?.length;
		this.config.enum = config.enum;
		this.config.nonUnicode = config.nonUnicode;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlVarChar(
			table,
			this.config,
		);
	}
}

export class MsSqlVarChar<T extends ColumnBaseConfig<'string' | 'string enum'>> extends MsSqlColumn<
	T,
	MsSqlVarCharConfig<
		'text',
		T['enumValues']
	> & { rawLength: number | 'max' | undefined }
> {
	static override readonly [entityKind]: string = 'MsSqlVarChar';

	override readonly enumValues = this.config.enum;

	readonly nonUnicode: boolean = this.config.nonUnicode;

	getSQLType(): string {
		return this.config.rawLength === undefined
			? this.nonUnicode ? `nvarchar` : `varchar`
			: this.nonUnicode
			? `nvarchar(${this.config.rawLength})`
			: `varchar(${this.config.rawLength})`;
	}
}

export class MsSqlVarCharJsonBuilder extends MsSqlColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: string;
}, { length: number; nonUnicode: boolean; rawLength: number | 'max' | undefined }> {
	static override readonly [entityKind]: string = 'MsSqlVarCharJsonBuilder';

	/** @internal */
	constructor(name: string, config: { length: number | 'max' | undefined }) {
		super(name, 'object json', 'MsSqlNVarCharJson');
		this.config.length = typeof config?.length === 'number' ? config.length : config?.length === 'max' ? 2147483647 : 1;
		this.config.rawLength = config?.length;
		this.config.nonUnicode = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlVarCharJson(
			table,
			this.config,
		);
	}
}

export class MsSqlVarCharJson<T extends ColumnBaseConfig<'object json'>>
	extends MsSqlColumn<T, { length: number; nonUnicode: boolean; rawLength: number | 'max' | undefined }>
{
	static override readonly [entityKind]: string = 'MsSqlVarCharJson';

	getSQLType(): string {
		return this.config.rawLength === undefined
			? `nvarchar`
			: `nvarchar(${this.config.rawLength})`;
	}

	override mapFromDriverValue(value: string): T['data'] {
		return JSON.parse(value);
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export type MsSqlVarCharConfig<
	TMode extends 'text' | 'json',
	TEnum extends string[] | readonly string[] | undefined,
> =
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

export function varchar(): MsSqlVarCharBuilder<[string, ...string[]]>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	config?: MsSqlVarCharConfigInitial<'text', T | Writable<T>>,
): MsSqlVarCharBuilder<Writable<T>>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	config?: MsSqlVarCharConfigInitial<'text', T | Writable<T>>,
): MsSqlVarCharBuilder<Writable<T>>;
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

export function nvarchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	config?: MsSqlVarCharConfigInitial<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? MsSqlVarCharJsonBuilder
	: MsSqlVarCharBuilder<Writable<T>>;
export function nvarchar<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	TMode extends 'text' | 'json' = 'text' | 'json',
>(
	name: string,
	config?: MsSqlVarCharConfigInitial<TMode, T | Writable<T>>,
): Equal<TMode, 'json'> extends true ? MsSqlVarCharJsonBuilder
	: MsSqlVarCharBuilder<Writable<T>>;
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
