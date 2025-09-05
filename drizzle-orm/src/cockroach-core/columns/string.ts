import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachStringBuilder<TEnum extends [string, ...string[]]> extends CockroachColumnWithArrayBuilder<
	{
		dataType: Equal<TEnum, [string, ...string[]]> extends true ? 'string' : 'string enum';
		data: TEnum[number];
		enumValues: TEnum;
		driverParam: string;
	},
	{ enumValues: TEnum | undefined; length: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachStringBuilder';

	constructor(name: string, config: CockroachStringConfig<TEnum>) {
		super(name, config.enum?.length ? 'string enum' : 'string', 'CockroachString');
		this.config.enumValues = config.enum;
		this.config.length = config.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachString(
			table,
			this.config,
		);
	}
}

export class CockroachString<
	T extends ColumnBaseConfig<'string' | 'string enum'>,
> extends CockroachColumn<T, { enumValues: [string, ...string[]] | undefined }> {
	static override readonly [entityKind]: string = 'CockroachString';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `string` : `string(${this.length})`;
	}
}

export interface CockroachStringConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
	length?: number | undefined;
}

export interface CockroachTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function string(): CockroachStringBuilder<[string, ...string[]]>;
export function string<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: CockroachStringConfig<T | Writable<T>>,
): CockroachStringBuilder<Writable<T>>;
export function string<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: CockroachStringConfig<T | Writable<T>>,
): CockroachStringBuilder<Writable<T>>;
export function string(a?: string | CockroachStringConfig, b: CockroachStringConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachStringConfig>(a, b);
	return new CockroachStringBuilder(name, config as any);
}

// text is alias for string but without ability to add length
export function text(): CockroachStringBuilder<[string, ...string[]]>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: CockroachTextConfig<T | Writable<T>>,
): CockroachStringBuilder<Writable<T>>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: CockroachTextConfig<T | Writable<T>>,
): CockroachStringBuilder<Writable<T>>;
export function text(a?: string | CockroachStringConfig, b: CockroachStringConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachStringConfig>(a, b);
	return new CockroachStringBuilder(name, config as any);
}
