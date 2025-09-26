import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export class MySqlTinyIntBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number uint8' : 'number int8';
	data: number;
	driverParam: number | string;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlTinyIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, config?.unsigned ? 'number uint8' : 'number int8' as any, 'MySqlTinyInt');
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

export class MySqlTinyInt<T extends ColumnBaseConfig<'number int8' | 'number uint8'>>
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

export function tinyint<TUnsigned extends boolean | undefined>(
	config?: MySqlIntConfig<TUnsigned>,
): MySqlTinyIntBuilder<TUnsigned>;
export function tinyint<TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlIntConfig<TUnsigned>,
): MySqlTinyIntBuilder<TUnsigned>;
export function tinyint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlTinyIntBuilder(name, config);
}
