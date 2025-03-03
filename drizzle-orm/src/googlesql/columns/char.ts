import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = GoogleSqlCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlChar';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	length: TLength;
}>;

export class GoogleSqlCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlChar'> & { length?: number | undefined },
> extends GoogleSqlColumnBuilder<
	T,
	GoogleSqlCharConfig<T['enumValues'], T['length']>,
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'GoogleSqlCharBuilder';

	constructor(name: T['name'], config: GoogleSqlCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'GoogleSqlChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }> {
		return new GoogleSqlChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlChar<T extends ColumnBaseConfig<'string', 'GoogleSqlChar'> & { length?: number | undefined }>
	extends GoogleSqlColumn<T, GoogleSqlCharConfig<T['enumValues'], T['length']>, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'GoogleSqlChar';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface GoogleSqlCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): GoogleSqlCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: GoogleSqlCharConfig<T | Writable<T>, L>,
): GoogleSqlCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: GoogleSqlCharConfig<T | Writable<T>, L>,
): GoogleSqlCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | GoogleSqlCharConfig, b: GoogleSqlCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlCharConfig>(a, b);
	return new GoogleSqlCharBuilder(name, config as any);
}
