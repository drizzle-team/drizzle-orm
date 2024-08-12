import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MySqlCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlChar';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
	generated: undefined;
}>;

export class MySqlCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlChar'>> extends MySqlColumnBuilder<
	T,
	MySqlCharConfig<T['enumValues']>
> {
	static readonly [entityKind]: string = 'MySqlCharBuilder';

	constructor(name: T['name'], config: MySqlCharConfig<T['enumValues']>) {
		super(name, 'string', 'MySqlChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MySqlChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlChar<T extends ColumnBaseConfig<'string', 'MySqlChar'>>
	extends MySqlColumn<T, MySqlCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MySqlChar';

	readonly length: number | undefined = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface MySqlCharConfig<TEnum extends readonly string[] | string[] | undefined> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlCharConfig<T | Writable<T>> = {},
): MySqlCharBuilderInitial<TName, Writable<T>> {
	return new MySqlCharBuilder(name, config);
}
