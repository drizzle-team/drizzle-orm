import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgSmallSerialBuilder extends PgColumnBuilder<{
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	protected override $pgColumnBuilderBrand!: 'PgSmallSerialBuilder';

	constructor(name: string) {
		super(name);
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgSmallSerial<TTableName> {
		return new PgSmallSerial(table, this.config);
	}
}

export class PgSmallSerial<TTableName extends string> extends PgColumn<{
	tableName: TTableName;
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	protected override $pgColumnBrand!: 'PgSmallSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function smallserial(name: string) {
	return new PgSmallSerialBuilder(name);
}
