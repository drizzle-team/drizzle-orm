import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import type { Writable } from '~/utils.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlCharBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> = MsSqlCharBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlChar';
	data: TEnum[number];
	driverParam: number | string;
	enumValues: TEnum;
}>;

export class MsSqlCharBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlChar'>> extends MsSqlColumnBuilder<
	T,
	MsSqlCharConfig<T['enumValues']>
> {
	static readonly [entityKind]: string = 'MsSqlCharBuilder';

	constructor(name: T['name'], config: MsSqlCharConfig<T['enumValues']>) {
		super(name, 'string', 'MsSqlChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new MsSqlChar<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlChar<T extends ColumnBaseConfig<'string', 'MsSqlChar'>>
	extends MsSqlColumn<T, MsSqlCharConfig<T['enumValues']>>
{
	static readonly [entityKind]: string = 'MsSqlChar';

	readonly length: number | undefined = this.config.length;
	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `char` : `char(${this.length})`;
	}
}

export interface MsSqlCharConfig<TEnum extends readonly string[] | string[] | undefined> {
	length?: number;
	enum?: TEnum;
}

export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	config: MsSqlCharConfig<T | Writable<T>> = {},
): MsSqlCharBuilderInitial<TName, Writable<T>> {
	return new MsSqlCharBuilder(name, config);
}
