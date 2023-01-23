import { AnyPgTable } from '~/table';

import { PgColumn, PgColumnBuilder } from './common';

export class PgSerialBuilder extends PgColumnBuilder<{
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	protected override $pgColumnBuilderBrand!: 'PgSerialBuilder';

	constructor(name: string) {
		super(name);
		this.config.hasDefault = true;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgSerial<TTableName> {
		return new PgSerial(table, this.config);
	}
}

export class PgSerial<TTableName extends string> extends PgColumn<{
	tableName: TTableName;
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	protected override $pgColumnBrand!: 'PgSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function serial(name: string) {
	return new PgSerialBuilder(name);
}
