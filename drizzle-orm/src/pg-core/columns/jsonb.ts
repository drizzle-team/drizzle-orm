import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgJsonbBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgJsonbBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgJsonbHKT;
}

export interface PgJsonbHKT extends ColumnHKTBase {
	_type: PgJsonb<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgJsonbBuilderInitial<TName extends string> = PgJsonbBuilder<{
	name: TName;
	data: unknown;
	driverParam: unknown;
	notNull: false;
	hasDefault: false;
}>;

export class PgJsonbBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgJsonbBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgJsonb<MakeColumnConfig<T, TTableName>> {
		return new PgJsonb<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgJsonb<T extends ColumnBaseConfig> extends PgColumn<PgJsonbHKT, T> {
	declare protected $pgColumnBrand: 'PgJsonb';

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgJsonbBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: T['data'] | string): T['data'] {
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch (e) {
				return value as T['data'];
			}
		}
		return value;
	}
}

export function jsonb<TName extends string>(name: TName): PgJsonbBuilderInitial<TName> {
	return new PgJsonbBuilder(name);
}
