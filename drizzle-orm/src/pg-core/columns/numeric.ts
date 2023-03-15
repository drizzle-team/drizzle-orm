import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgNumericBuilder extends PgColumnBuilder<
	ColumnBuilderConfig<{ data: string; driverParam: string }>,
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	protected override $pgColumnBuilderBrand!: 'PgNumericBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgNumeric<TTableName> {
		return new PgNumeric(table, this.config);
	}
}

export class PgNumeric<TTableName extends string> extends PgColumn<
	ColumnConfig<{ tableName: TTableName; data: string; driverParam: string }>
> {
	protected override $pgColumnBrand!: 'PgNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgNumericBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	getSQLType(): string {
		if (typeof this.precision !== 'undefined' && typeof this.scale !== 'undefined') {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (typeof this.precision === 'undefined') {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export function numeric(
	name: string,
	config?:
		| { precision: number; scale?: number }
		| { precision?: number; scale: number }
		| { precision: number; scale: number },
): PgNumericBuilder {
	return new PgNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
