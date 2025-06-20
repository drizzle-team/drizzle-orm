import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachStringBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = CockroachStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachString';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	length: TLength;
}>;

export class CockroachStringBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'CockroachString'> & { length?: number | undefined },
> extends CockroachColumnWithArrayBuilder<
	T,
	{ length: T['length']; enumValues: T['enumValues'] },
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'CockroachStringBuilder';

	constructor(name: T['name'], config: CockroachStringConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'CockroachString');
		this.config.length = config.length;
		this.config.enumValues = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachString<MakeColumnConfig<T, TTableName> & { length: T['length'] }> {
		return new CockroachString<MakeColumnConfig<T, TTableName> & { length: T['length'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachString<
	T extends ColumnBaseConfig<'string', 'CockroachString'> & { length?: number | undefined },
> extends CockroachColumn<T, { length: T['length']; enumValues: T['enumValues'] }, { length: T['length'] }> {
	static override readonly [entityKind]: string = 'CockroachString';

	readonly length = this.config.length;
	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return this.length === undefined ? `string` : `string(${this.length})`;
	}
}

export interface CockroachStringConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export interface CockroachTextConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
> {
	enum?: TEnum;
}

export function string(): CockroachStringBuilderInitial<'', [string, ...string[]], undefined>;
export function string<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	config?: CockroachStringConfig<T | Writable<T>, L>,
): CockroachStringBuilderInitial<'', Writable<T>, L>;
export function string<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: CockroachStringConfig<T | Writable<T>, L>,
): CockroachStringBuilderInitial<TName, Writable<T>, L>;
export function string(a?: string | CockroachStringConfig, b: CockroachStringConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachStringConfig>(a, b);
	return new CockroachStringBuilder(name, config as any);
}

// text is alias for string but without ability to add length
export function text(): CockroachStringBuilderInitial<'', [string, ...string[]], undefined>;
export function text<
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: CockroachTextConfig<T | Writable<T>>,
): CockroachStringBuilderInitial<'', Writable<T>, undefined>;
export function text<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: TName,
	config?: CockroachTextConfig<T | Writable<T>>,
): CockroachStringBuilderInitial<TName, Writable<T>, undefined>;
export function text(a?: string | CockroachStringConfig, b: CockroachStringConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<CockroachStringConfig>(a, b);
	return new CockroachStringBuilder(name, config as any);
}
