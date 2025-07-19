import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export type MySqlSmallIntBuilderInitial<TName extends string> = MySqlSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlSmallIntBuilder';

	constructor(name: T['name'], config?: MySqlIntConfig) {
		super(name, 'number', 'MySqlSmallInt');
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

export class MySqlSmallInt<T extends ColumnBaseConfig<'number'>>
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

export function smallint(): MySqlSmallIntBuilderInitial<''>;
export function smallint(
	config?: MySqlIntConfig,
): MySqlSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(
	name: TName,
	config?: MySqlIntConfig,
): MySqlSmallIntBuilderInitial<TName>;
export function smallint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlSmallIntBuilder(name, config);
}
