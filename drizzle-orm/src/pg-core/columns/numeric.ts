import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgNumericBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgNumericBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgNumericHKT;
}

export interface PgNumericHKT extends ColumnHKTBase {
	_type: PgNumeric<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgNumericBuilderInitial<TName extends string> = PgNumericBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgNumericBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgNumericBuilderHKT,
	T,
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgNumeric<MakeColumnConfig<T, TTableName>> {
		return new PgNumeric<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgNumeric<T extends ColumnBaseConfig> extends PgColumn<PgNumericHKT, T> {
	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgNumericBuilder<T>['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export function numeric<TName extends string>(
	name: TName,
	config?:
		| { precision: number; scale?: number }
		| { precision?: number; scale: number }
		| { precision: number; scale: number },
): PgNumericBuilderInitial<TName> {
	return new PgNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
