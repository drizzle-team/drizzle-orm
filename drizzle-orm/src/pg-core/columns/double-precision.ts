import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgDoublePrecisionBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgDoublePrecisionBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgDoublePrecisionHKT;
}

export interface PgDoublePrecisionHKT extends ColumnHKTBase {
	_type: PgDoublePrecision<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgDoublePrecisionBuilderInitial<TName extends string> = PgDoublePrecisionBuilder<{
	name: TName;
	data: number;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class PgDoublePrecisionBuilder<T extends ColumnBuilderBaseConfig>
	extends PgColumnBuilder<PgDoublePrecisionBuilderHKT, T>
{
	static readonly [entityKind]: string = 'PgDoublePrecisionBuilder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDoublePrecision<MakeColumnConfig<T, TTableName>> {
		return new PgDoublePrecision<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgDoublePrecision<T extends ColumnBaseConfig> extends PgColumn<PgDoublePrecisionHKT, T> {
	static readonly [entityKind]: string = 'PgDoublePrecision';

	getSQLType(): string {
		return 'double precision';
	}

	override mapFromDriverValue(value: string | number): number {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	}
}

export function doublePrecision<TName extends string>(name: TName): PgDoublePrecisionBuilderInitial<TName> {
	return new PgDoublePrecisionBuilder(name);
}
