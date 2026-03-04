import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlIntBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number uint32' : 'number int32';
	data: number;
	driverParam: number | string;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, config?.unsigned ? 'number uint32' : 'number int32' as any, 'MySqlInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlInt(table, this.config as any);
	}
}

export class MySqlInt<T extends ColumnBaseConfig<'number int32' | 'number uint32'>>
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

export interface MySqlIntConfig<TUnsigned extends boolean | undefined = boolean | undefined> {
	unsigned?: TUnsigned;
}

export function int<TUnsigned extends boolean | undefined>(
	config?: MySqlIntConfig<TUnsigned>,
): MySqlIntBuilder<TUnsigned>;
export function int<TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlIntConfig,
): MySqlIntBuilder<TUnsigned>;
export function int(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlIntBuilder(name, config);
}
