import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export class MySqlMediumIntBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number int24';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlMediumIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, 'number int24', 'MySqlMediumInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlMediumInt(
			table,
			this.config as any,
		);
	}
}

export class MySqlMediumInt<T extends ColumnBaseConfig<'number int24'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlMediumInt';

	getSQLType(): string {
		return `mediumint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function mediumint(
	config?: MySqlIntConfig,
): MySqlMediumIntBuilder;
export function mediumint(
	name: string,
	config?: MySqlIntConfig,
): MySqlMediumIntBuilder;
export function mediumint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlMediumIntBuilder(name, config);
}
