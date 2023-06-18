import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlVarBinaryBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlVarBinaryBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlVarBinaryHKT;
}

export interface MySqlVarBinaryHKT extends ColumnHKTBase {
	_type: MySqlVarBinary<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlVarBinaryBuilderInitial<TName extends string> = MySqlVarBinaryBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlVarBinaryBuilderHKT,
	T,
	MySqlVarbinaryOptions
> {
	static readonly [entityKind]: string = 'MySqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: MySqlVarbinaryOptions) {
		super(name);
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlVarBinary<MakeColumnConfig<T, TTableName>> {
		return new MySqlVarBinary<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlVarBinary<
	T extends ColumnBaseConfig,
> extends MySqlColumn<MySqlVarBinaryHKT, T, MySqlVarbinaryOptions> {
	static readonly [entityKind]: string = 'MySqlVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface MySqlVarbinaryOptions {
	length: number;
}

export function varbinary<TName extends string>(
	name: TName,
	options: MySqlVarbinaryOptions,
): MySqlVarBinaryBuilderInitial<TName> {
	return new MySqlVarBinaryBuilder(name, options);
}
