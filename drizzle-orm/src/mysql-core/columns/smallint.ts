import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export class MySqlSmallIntBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number int16';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlSmallIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, 'number int16', 'MySqlSmallInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlSmallInt(
			table,
			this.config as any,
		);
	}
}

export class MySqlSmallInt<T extends ColumnBaseConfig<'number int16'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlSmallInt';

	getSQLType(): string {
		return `smallint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint(
	config?: MySqlIntConfig,
): MySqlSmallIntBuilder;
export function smallint(
	name: string,
	config?: MySqlIntConfig,
): MySqlSmallIntBuilder;
export function smallint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlSmallIntBuilder(name, config);
}
