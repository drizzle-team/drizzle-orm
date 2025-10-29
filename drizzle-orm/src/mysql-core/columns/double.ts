import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlDoubleBuilderInitial<TName extends string> = MySqlDoubleBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlDouble';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlDoubleBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlDouble'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDoubleConfig>
{
	static override readonly [entityKind]: string = 'MySqlDoubleBuilder';

	constructor(name: T['name'], config: MySqlDoubleConfig | undefined) {
		super(name, 'number', 'MySqlDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDouble<MakeColumnConfig<T, TTableName>> {
		return new MySqlDouble<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlDouble<T extends ColumnBaseConfig<'number', 'MySqlDouble'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDoubleConfig>
{
	static override readonly [entityKind]: string = 'MySqlDouble';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `double(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'double';
		} else {
			type += `double(${this.precision})`;
		}
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface MySqlDoubleConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function double(): MySqlDoubleBuilderInitial<''>;
export function double(
	config?: MySqlDoubleConfig,
): MySqlDoubleBuilderInitial<''>;
export function double<TName extends string>(
	name: TName,
	config?: MySqlDoubleConfig,
): MySqlDoubleBuilderInitial<TName>;
export function double(a?: string | MySqlDoubleConfig, b?: MySqlDoubleConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlDoubleConfig>(a, b);
	return new MySqlDoubleBuilder(name, config);
}
