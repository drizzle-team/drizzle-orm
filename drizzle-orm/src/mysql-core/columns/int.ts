import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlIntBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number integer';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, 'number integer', 'MySqlInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlInt(table, this.config as any);
	}
}

export class MySqlInt<T extends ColumnBaseConfig<'number integer'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlInt';

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

export interface MySqlIntConfig {
	unsigned?: boolean;
}

export function int(
	config?: MySqlIntConfig,
): MySqlIntBuilder;
export function int(
	name: string,
	config?: MySqlIntConfig,
): MySqlIntBuilder;
export function int(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlIntBuilder(name, config);
}
