import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlDoubleBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, MySqlDoubleConfig> {
	static override readonly [entityKind]: string = 'MySqlDoubleBuilder';

	constructor(name: string, config: MySqlDoubleConfig | undefined) {
		super(name, 'number', 'MySqlDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDouble(table, this.config as any);
	}
}

export class MySqlDouble<T extends ColumnBaseConfig<'number'>>
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

export function double(
	config?: MySqlDoubleConfig,
): MySqlDoubleBuilder;
export function double(
	name: string,
	config?: MySqlDoubleConfig,
): MySqlDoubleBuilder;
export function double(a?: string | MySqlDoubleConfig, b?: MySqlDoubleConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlDoubleConfig>(a, b);
	return new MySqlDoubleBuilder(name, config);
}
