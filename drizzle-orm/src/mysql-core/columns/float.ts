import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlFloatBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number ufloat' : 'number float';
	data: number;
	driverParam: number | string;
}, MySqlFloatConfig> {
	static override readonly [entityKind]: string = 'MySqlFloatBuilder';

	constructor(name: string, config: MySqlFloatConfig | undefined) {
		super(name, config?.unsigned ? 'number ufloat' : 'number float' as any, 'MySqlFloat');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlFloat(table, this.config as any);
	}
}

export class MySqlFloat<T extends ColumnBaseConfig<'number float' | 'number ufloat'>>
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

export interface MySqlFloatConfig<TUnsigned extends boolean | undefined = boolean | undefined> {
	precision?: number;
	scale?: number;
	unsigned?: TUnsigned;
}

export function float<TUnsigned extends boolean | undefined>(
	config?: MySqlFloatConfig<TUnsigned>,
): MySqlFloatBuilder<TUnsigned>;
export function float<TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlFloatConfig<TUnsigned>,
): MySqlFloatBuilder<TUnsigned>;
export function float(a?: string | MySqlFloatConfig, b?: MySqlFloatConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlFloatConfig>(a, b);
	return new MySqlFloatBuilder(name, config);
}
