import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlFloatBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number float';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, MySqlFloatConfig> {
	static override readonly [entityKind]: string = 'MySqlFloatBuilder';

	constructor(name: string, config: MySqlFloatConfig | undefined) {
		super(name, 'number float', 'MySqlFloat');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlFloat(table, this.config as any);
	}
}

export class MySqlFloat<T extends ColumnBaseConfig<'number float'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlFloatConfig>
{
	static override readonly [entityKind]: string = 'MySqlFloat';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	override mapFromDriverValue(value: unknown): number {
		// For RQBv2 - conversion to JSON loses precision otherwise
		if (typeof value === 'string') {
			return Number(value);
		}

		return value as number;
	}

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

export function float(
	config?: MySqlFloatConfig,
): MySqlFloatBuilder;
export function float(
	name: string,
	config?: MySqlFloatConfig,
): MySqlFloatBuilder;
export function float(a?: string | MySqlFloatConfig, b?: MySqlFloatConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlFloatConfig>(a, b);
	return new MySqlFloatBuilder(name, config);
}
