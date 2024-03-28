import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MySqlVarCharBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlVarChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		generated: undefined;
	}
>;

export class MySqlVarCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlVarChar'>>
	extends MySqlColumnBuilder<T, MySqlVarCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MySqlVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarCharConfig<T['enumValues']>) {
		super(name, 'string', 'MySqlVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MySqlVarChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarChar<T extends ColumnBaseConfig<'string', 'MySqlVarChar'>>
	extends MySqlColumn<T, MySqlVarCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MySqlVarChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface MySqlVarCharConfig<TEnum extends string[] | readonly string[] | undefined> {
	length: number;
	enum?: TEnum;
}

export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MySqlVarCharConfig<T | Writable<T>>,
): MySqlVarCharBuilderInitial<TName, Writable<T>> {
	return new MySqlVarCharBuilder(name, config);
}
