import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlIntBuilderInitial<TName extends string> = MySqlIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlIntBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlIntBuilder';

	constructor(name: T['name'], config?: MySqlIntConfig) {
		super(name, 'number', 'MySqlInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlInt(table, this.config as any);
	}
}

export class MySqlInt<T extends ColumnBaseConfig<'number'>>
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

export function int(): MySqlIntBuilderInitial<''>;
export function int(
	config?: MySqlIntConfig,
): MySqlIntBuilderInitial<''>;
export function int<TName extends string>(
	name: TName,
	config?: MySqlIntConfig,
): MySqlIntBuilderInitial<TName>;
export function int(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlIntBuilder(name, config);
}
