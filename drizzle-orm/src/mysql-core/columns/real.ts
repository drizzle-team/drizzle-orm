import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlRealBuilder extends MySqlColumnBuilderWithAutoIncrement<
	{
		dataType: 'number double';
		data: number;
		driverParam: number | string;
	},
	MySqlRealConfig
> {
	static override readonly [entityKind]: string = 'MySqlRealBuilder';

	constructor(name: string, config: MySqlRealConfig | undefined) {
		super(name, 'number double', 'MySqlReal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlReal(table, this.config as any);
	}
}

export class MySqlReal<T extends ColumnBaseConfig<'number double'>> extends MySqlColumnWithAutoIncrement<
	T,
	MySqlRealConfig
> {
	static override readonly [entityKind]: string = 'MySqlReal';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `real(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export interface MySqlRealConfig {
	precision?: number;
	scale?: number;
}

export function real(
	config?: MySqlRealConfig,
): MySqlRealBuilder;
export function real(
	name: string,
	config?: MySqlRealConfig,
): MySqlRealBuilder;
export function real(a?: string | MySqlRealConfig, b: MySqlRealConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlRealConfig>(a, b);
	return new MySqlRealBuilder(name, config);
}
