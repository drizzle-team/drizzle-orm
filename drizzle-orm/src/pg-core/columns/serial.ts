import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgSerialBuilder extends PgColumnBuilder<{
	dataType: 'number int32';
	data: number;
	driverParam: number;

	notNull: true;
	hasDefault: true;
}> {
	static override readonly [entityKind]: string = 'PgSerialBuilder';

	constructor(name: string) {
		super(name, 'number int32', 'PgSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgSerial(table, this.config as any);
	}
}

export class PgSerial extends PgColumn<'number int32'> {
	static override readonly [entityKind]: string = 'PgSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function serial(name?: string): PgSerialBuilder {
	return new PgSerialBuilder(name ?? '');
}
