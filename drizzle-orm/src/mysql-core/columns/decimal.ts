import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlDecimalBuilderInitial<TName extends string> = MySqlDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
	identity: undefined;
}>;

export class MySqlDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MySqlDecimal'>,
> extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalBuilder';

	constructor(name: T['name'], config: MySqlDecimalConfig | undefined) {
		super(name, 'string', 'MySqlDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new MySqlDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDecimal<T extends ColumnBaseConfig<'string', 'MySqlDecimal'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MySqlDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'decimal';
		} else {
			type += `decimal(${this.precision})`;
		}
		type = type === 'decimal(10,0)' || type === 'decimal(10)' ? 'decimal' : type;
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface MySqlDecimalConfig {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
}

export function decimal(): MySqlDecimalBuilderInitial<''>;
export function decimal(
	config: MySqlDecimalConfig,
): MySqlDecimalBuilderInitial<''>;
export function decimal<TName extends string>(
	name: TName,
	config?: MySqlDecimalConfig,
): MySqlDecimalBuilderInitial<TName>;
export function decimal(a?: string | MySqlDecimalConfig, b: MySqlDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlDecimalConfig>(a, b);
	return new MySqlDecimalBuilder(name, config);
}
