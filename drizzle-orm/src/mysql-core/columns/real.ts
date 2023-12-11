import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlRealBuilderInitial<TName extends string> = MySqlRealBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'MySqlReal';
		data: number;
		driverParam: number | string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'MySqlReal'>>
	extends MySqlColumnBuilderWithAutoIncrement<
		T,
		MySqlRealConfig
	>
{
	static readonly [entityKind]: string = 'MySqlRealBuilder';

	constructor(name: T['name'], config: MySqlRealConfig | undefined) {
		super(name, 'number', 'MySqlReal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlReal<MakeColumnConfig<T, TTableName>> {
		return new MySqlReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlReal<T extends ColumnBaseConfig<'number', 'MySqlReal'>> extends MySqlColumnWithAutoIncrement<
	T,
	MySqlRealConfig
> {
	static readonly [entityKind]: string = 'MySqlReal';

	precision: number | undefined = this.config.precision;
	scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `real(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'real';
		} else {
			return `real(${this.precision})`;
		}
	}
}

export interface MySqlRealConfig {
	precision?: number;
	scale?: number;
}

export function real<TName extends string>(name: TName, config: MySqlRealConfig = {}): MySqlRealBuilderInitial<TName> {
	return new MySqlRealBuilder(name, config);
}
