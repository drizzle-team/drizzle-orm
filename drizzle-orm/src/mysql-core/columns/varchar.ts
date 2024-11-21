import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlVarCharBuilderInitial<
	TName extends string,
	TLength extends number | undefined,
	TEnum extends [string, ...string[]],
> = MySqlVarCharBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlVarChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		generated: undefined;
		length: TLength;
	}
>;

export class MySqlVarCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MySqlVarChar'> & { length: number | undefined },
> extends MySqlColumnBuilder<T, MySqlVarCharConfig<T['length'], T['enumValues']>> {
	static override readonly [entityKind]: string = 'MySqlVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarCharConfig<T['length'], T['enumValues']>) {
		super(name, 'string', 'MySqlVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }> {
		return new MySqlVarChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlVarChar<T extends ColumnBaseConfig<'string', 'MySqlVarChar'> & { length: number | undefined }>
	extends MySqlColumn<T, MySqlVarCharConfig<T['length'], T['enumValues']>>
{
	static override readonly [entityKind]: string = 'MySqlVarChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface MySqlVarCharConfig<
	TLength extends number | undefined = number | undefined,
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
> {
	length: TLength;
	enum?: TEnum;
}

export function varchar<U extends string, L extends number | undefined, T extends Readonly<[U, ...U[]]>>(
	config: MySqlVarCharConfig<L, T | Writable<T>>,
): MySqlVarCharBuilderInitial<'', L, Writable<T>>;
export function varchar<
	TName extends string,
	L extends number | undefined,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
>(
	name: TName,
	config: MySqlVarCharConfig<L, T | Writable<T>>,
): MySqlVarCharBuilderInitial<TName, L, Writable<T>>;
export function varchar(a?: string | MySqlVarCharConfig, b?: MySqlVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<MySqlVarCharConfig>(a, b);
	return new MySqlVarCharBuilder(name, config as any);
}
