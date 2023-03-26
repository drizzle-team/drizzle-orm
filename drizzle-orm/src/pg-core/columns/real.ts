import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgRealBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgRealBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgRealHKT;
}

export interface PgRealHKT extends ColumnHKTBase {
	_type: PgReal<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgRealBuilderInitial<TName extends string> = PgRealBuilder<{
	name: TName;
	data: number;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class PgRealBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgRealBuilderHKT,
	T,
	{ length: number | undefined }
> {
	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgReal<MakeColumnConfig<T, TTableName>> {
		return new PgReal<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgReal<T extends ColumnBaseConfig> extends PgColumn<PgRealHKT, T> {
	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgRealBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue = (value: string | number): number => {
		if (typeof value === 'string') {
			return parseFloat(value);
		}
		return value;
	};
}

export function real<TName extends string>(name: TName): PgRealBuilderInitial<TName> {
	return new PgRealBuilder(name);
}
