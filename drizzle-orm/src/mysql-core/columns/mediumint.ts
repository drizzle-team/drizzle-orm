import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export class MySqlMediumIntBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number uint24' : 'number int24';
	data: number;
	driverParam: number | string;
}, MySqlIntConfig> {
	static override readonly [entityKind]: string = 'MySqlMediumIntBuilder';

	constructor(name: string, config?: MySqlIntConfig) {
		super(name, config?.unsigned ? 'number uint24' : 'number int24' as any, 'MySqlMediumInt');
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

export class MySqlMediumInt<T extends ColumnBaseConfig<'number int24' | 'number uint24'>>
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

export function mediumint<TUnsigned extends boolean | undefined>(
	config?: MySqlIntConfig<TUnsigned>,
): MySqlMediumIntBuilder<TUnsigned>;
export function mediumint<TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlIntConfig<TUnsigned>,
): MySqlMediumIntBuilder<TUnsigned>;
export function mediumint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlMediumIntBuilder(name, config);
}
