import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlStringBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined | "MAX",
> = GoogleSqlStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlString';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	length: TLength;
}>;


// TODO: SPANNER - check how those "enum" work
export class GoogleSqlStringBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlString'> & { length?: number | undefined | "MAX" },
> extends GoogleSqlColumnBuilder<
	T,
	GoogleSqlStringConfig<T['enumValues'], T['length']>,
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'GoogleSqlStringBuilder';

	constructor(name: T['name'], config: GoogleSqlStringConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'GoogleSqlString');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlString<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }> {
		return new GoogleSqlString<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlString<T extends ColumnBaseConfig<'string', 'GoogleSqlString'> & { length?: number | undefined | "MAX" }>
	extends GoogleSqlColumn<T, GoogleSqlStringConfig<T['enumValues'], T['length']>, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'GoogleSqlString';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `string(MAX)` : `string(${this.length})`;
	}
}

export interface GoogleSqlStringConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined | "MAX" = number | undefined | "MAX",
> {
	enum?: TEnum;
	length?: TLength;
}

export function string(): GoogleSqlStringBuilderInitial<'', [string, ...string[]], undefined>;
export function string<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: GoogleSqlStringConfig<T | Writable<T>, L>,
): GoogleSqlStringBuilderInitial<'', Writable<T>, L>;
export function string<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: GoogleSqlStringConfig<T | Writable<T>, L>,
): GoogleSqlStringBuilderInitial<TName, Writable<T>, L>;
export function string(a?: string | GoogleSqlStringConfig, b: GoogleSqlStringConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlStringConfig>(a, b);
	return new GoogleSqlStringBuilder(name, config as any);
}
