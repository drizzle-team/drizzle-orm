import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgJsonBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgJsonBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgJsonHKT;
}

export interface PgJsonHKT extends ColumnHKTBase {
	_type: PgJson<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgJsonBuilderInitial<TName extends string> = PgJsonBuilder<{
	name: TName;
	data: unknown;
	driverParam: unknown;
	notNull: false;
	hasDefault: false;
}>;

export class PgJsonBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgJsonBuilderHKT,
	T
> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgJson<MakeColumnConfig<T, TTableName>> {
		return new PgJson<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgJson<T extends ColumnBaseConfig> extends PgColumn<PgJsonHKT, T> {
	declare protected $pgColumnBrand: 'PgJson';

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgJsonBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'json';
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

export function json<TName extends string>(name: TName): PgJsonBuilderInitial<TName> {
	return new PgJsonBuilder(name);
}
