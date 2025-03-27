import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';
import type { MySqlIntConfig } from './int.ts';

export type MySqlMediumIntBuilderInitial<TName extends string> = MySqlMediumIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlMediumInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MySqlMediumIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlMediumInt'>>
	extends MySqlColumnBuilderWithAutoIncrement<T, MySqlIntConfig>
{
	static override readonly [entityKind]: string = 'MySqlMediumIntBuilder';

	constructor(name: T['name'], config?: MySqlIntConfig) {
		super(name, 'number', 'MySqlMediumInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlMediumInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlMediumInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlMediumInt<T extends ColumnBaseConfig<'number', 'MySqlMediumInt'>>
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

export function mediumint(): MySqlMediumIntBuilderInitial<''>;
export function mediumint(
	config?: MySqlIntConfig,
): MySqlMediumIntBuilderInitial<''>;
export function mediumint<TName extends string>(
	name: TName,
	config?: MySqlIntConfig,
): MySqlMediumIntBuilderInitial<TName>;
export function mediumint(a?: string | MySqlIntConfig, b?: MySqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlIntConfig>(a, b);
	return new MySqlMediumIntBuilder(name, config);
}
