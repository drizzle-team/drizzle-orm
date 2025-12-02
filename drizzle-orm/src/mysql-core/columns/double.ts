import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlDoubleBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number udouble' : 'number double';
	data: number;
	driverParam: number | string;
}, MySqlDoubleConfig> {
	static override readonly [entityKind]: string = 'MySqlDoubleBuilder';

	constructor(name: string, config: MySqlDoubleConfig | undefined) {
		super(name, config?.unsigned ? 'number udouble' : 'number double' as any, 'MySqlDouble');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDouble(table, this.config as any);
	}
}

export class MySqlDouble<T extends ColumnBaseConfig<'number double' | 'number udouble'>>
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

export interface MySqlDoubleConfig<TUnsigned extends boolean | undefined = boolean | undefined> {
	precision?: number;
	scale?: number;
	unsigned?: TUnsigned;
}

export function double<TUnsigned extends boolean | undefined>(
	config?: MySqlDoubleConfig<TUnsigned>,
): MySqlDoubleBuilder<TUnsigned>;
export function double<TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlDoubleConfig<TUnsigned>,
): MySqlDoubleBuilder<TUnsigned>;
export function double(a?: string | MySqlDoubleConfig, b?: MySqlDoubleConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlDoubleConfig>(a, b);
	return new MySqlDoubleBuilder(name, config);
}
