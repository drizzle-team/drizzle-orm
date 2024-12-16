import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = MySqlCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlChar';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	length: TLength;
}>;

export class MySqlCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MySqlChar'> & { length?: number | undefined },
> extends MySqlColumnBuilder<
	T,
	MySqlCharConfig<T['enumValues'], T['length']>,
	{ length: T['length'] }
> {
	static override readonly [entityKind]: string = 'MySqlCharBuilder';

	constructor(name: T['name'], config: MySqlCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'MySqlChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }> {
		return new MySqlChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlChar<T extends ColumnBaseConfig<'string', 'MySqlChar'> & { length?: number | undefined }>
	extends MySqlColumn<T, MySqlCharConfig<T['enumValues'], T['length']>, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'MySqlChar';

	readonly length: T['length'] = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface MySqlCharConfig<
	TEnum extends readonly string[] | string[] | undefined = readonly string[] | string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function char(): MySqlCharBuilderInitial<'', [string, ...string[]], undefined>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config?: MySqlCharConfig<T | Writable<T>, L>,
): MySqlCharBuilderInitial<'', Writable<T>, L>;
export function char<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config?: MySqlCharConfig<T | Writable<T>, L>,
): MySqlCharBuilderInitial<TName, Writable<T>, L>;
export function char(a?: string | MySqlCharConfig, b: MySqlCharConfig = {}): any {
	const { name, config } = getColumnNameAndConfig<MySqlCharConfig>(a, b);
	return new MySqlCharBuilder(name, config as any);
}
