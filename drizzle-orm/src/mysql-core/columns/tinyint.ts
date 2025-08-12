import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export class MySqlTinyIntBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number tinyint';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlTinyIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, 'number tinyint', 'MySqlTinyInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlTinyInt(
			table,
			this.config as any,
		);
	}
}

export class MySqlTinyInt<T extends ColumnBaseConfig<'number tinyint'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlTinyInt';

	getSQLType(): string {
		return `tinyint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint(
	config?: MySqlIntConfig,
): MySqlTinyIntBuilder;
export function tinyint(
	name: string,
	config?: MySqlIntConfig,
): MySqlTinyIntBuilder;
export function tinyint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlTinyIntBuilder(name, config);
}
