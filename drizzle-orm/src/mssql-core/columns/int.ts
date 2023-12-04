import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithAutoIncrement, MsSqlColumnWithAutoIncrement } from './common.ts';

export type MsSqlIntBuilderInitial<TName extends string> = MsSqlIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlInt'>>
	extends MsSqlColumnBuilderWithAutoIncrement<T, MsSqlIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlIntBuilder';

	constructor(name: T['name'], config?: MsSqlIntConfig) {
		super(name, 'number', 'MsSqlInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlInt<T extends ColumnBaseConfig<'number', 'MsSqlInt'>>
	extends MsSqlColumnWithAutoIncrement<T, MsSqlIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlInt';

	getSQLType(): string {
		return `int${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export interface MsSqlIntConfig {
	unsigned?: boolean;
}

export function int<TName extends string>(name: TName, config?: MsSqlIntConfig): MsSqlIntBuilderInitial<TName> {
	return new MsSqlIntBuilder(name, config);
}
