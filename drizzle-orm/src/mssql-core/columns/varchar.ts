import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlVarCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MsSqlVarCharBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MsSqlVarChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
	}
>;

export class MsSqlVarCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlVarChar'>>
	extends MsSqlColumnBuilder<T, MsSqlVarCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MsSqlVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: MsSqlVarCharConfig<T['enumValues']>) {
		super(name, 'string', 'MsSqlVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
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
	extends MsSqlColumn<T, MsSqlVarCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MsSqlVarChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface MsSqlVarCharConfig<TEnum extends string[] | readonly string[] | undefined> {
	length: number;
	enum?: TEnum;
}

export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MsSqlVarCharConfig<T | Writable<T>>,
): MsSqlVarCharBuilderInitial<TName, Writable<T>> {
	return new MsSqlVarCharBuilder(name, config);
}
