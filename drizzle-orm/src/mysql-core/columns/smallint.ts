import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export class MySqlSmallIntBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number uint16' : 'number int16';
	data: number;
	driverParam: number | string;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlSmallIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, config?.unsigned ? 'number uint16' : 'number int16' as any, 'MySqlSmallInt');
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

export class MySqlSmallInt<T extends ColumnBaseConfig<'number int16' | 'number uint16'>>
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

export function smallint<TUnsigned extends boolean | undefined>(
	config?: MySqlIntConfig<TUnsigned>,
): MySqlSmallIntBuilder<TUnsigned>;
export function smallint<TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlIntConfig<TUnsigned>,
): MySqlSmallIntBuilder<TUnsigned>;
export function smallint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlSmallIntBuilder(name, config);
}
