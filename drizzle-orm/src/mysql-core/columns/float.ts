import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlFloatBuilderInitial<TName extends string> = MySqlFloatBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlFloat';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlFloatBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlFloat'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlFloatConfig>
{
	static override readonly [entityKind]: string = 'MySqlFloatBuilder';

	constructor(name: T['name'], config: MySqlFloatConfig | undefined) {
		super(name, 'number', 'MySqlFloat');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlFloat<MakeColumnConfig<T, TTableName>> {
		return new MySqlFloat<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlFloat<T extends ColumnBaseConfig<'number', 'MySqlFloat'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlFloatConfig>
{
	static override readonly [entityKind]: string = 'MySqlFloat';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `float(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'float';
		} else {
			type += `float(${this.precision})`;
		}
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface MySqlFloatConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function float(): MySqlFloatBuilderInitial<''>;
export function float(
	config?: MySqlFloatConfig,
): MySqlFloatBuilderInitial<''>;
export function float<TName extends string>(
	name: TName,
	config?: MySqlFloatConfig,
): MySqlFloatBuilderInitial<TName>;
export function float(a?: string | MySqlFloatConfig, b?: MySqlFloatConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlFloatConfig>(a, b);
	return new MySqlFloatBuilder(name, config);
}
