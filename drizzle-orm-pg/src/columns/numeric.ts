import { AnyTable } from 'drizzle-orm';

import { PgColumn, PgColumnBuilder } from './common';

export class PgNumericBuilder<
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
> extends PgColumnBuilder<PgNumeric<string, TNotNull, TDefault>, string, TNotNull, TDefault> {
	/** @internal */ precision: number | undefined;
	/** @internal */ scale: number | undefined;

	constructor(name: string, precision?: number, scale?: number) {
		super(name);
		this.precision = precision;
		this.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyTable<TTableName>,
	): PgNumeric<TTableName, TNotNull, TDefault> {
		return new PgNumeric(table, this);
	}
}

export class PgNumeric<
	TTableName extends string,
	TNotNull extends boolean,
	TDefault extends boolean,
> extends PgColumn<TTableName, string, string, TNotNull, TDefault> {
	precision: number | undefined;
	scale: number | undefined;

	constructor(table: AnyTable<TTableName>, builder: PgNumericBuilder<TNotNull, TDefault>) {
		super(table, builder);
		this.precision = builder.precision;
		this.scale = builder.scale;
	}

	getSQLType(): string {
		if (this.precision && this.scale) {
			return `numeric(${this.precision},${this.scale})`;
		} else if (typeof this.precision === 'undefined') {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export function numeric(name: string, length?: number) {
	return new PgNumericBuilder(name, length);
}
