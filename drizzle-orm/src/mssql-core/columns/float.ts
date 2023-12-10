import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlFloatBuilderInitial<TName extends string> = MsSqlFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlFloat';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class MsSqlFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlFloat'>>
	extends MsSqlColumnBuilderWithIdentity<T, MsSqlFloatConfig>
{
	static readonly [entityKind]: string = 'MsSqlFloatBuilder';

	constructor(name: T['name'], config?: MsSqlFloatConfig) {
		super(name, 'number', 'MsSqlFloat');
		this.config.precision = config?.precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlFloat<MakeColumnConfig<T, TTableName>> {
		return new MsSqlFloat<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlFloat<T extends ColumnBaseConfig<'number', 'MsSqlFloat'>>
	extends MsSqlColumnWithIdentity<T, MsSqlFloatConfig>
{
	static readonly [entityKind]: string = 'MsSqlFloat';

	readonly precision: number | undefined = this.config.precision;

	_getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `float${precision}`;
	}
}

export interface MsSqlFloatConfig {
	precision?: number;
}

export function float<TName extends string>(name: TName, config?: MsSqlFloatConfig): MsSqlFloatBuilderInitial<TName> {
	return new MsSqlFloatBuilder(name, config);
}
