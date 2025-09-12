import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgSmallSerialBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'number int16';
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	static override readonly [entityKind]: string = 'PgSmallSerialBuilder';

	constructor(name: string) {
		super(name, 'number int16', 'PgSmallSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgSmallSerial(
			table,
			this.config as any,
		);
	}
}

export class PgSmallSerial<T extends ColumnBaseConfig<'number int16'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgSmallSerial';

	getSQLType(): string {
		return 'smallserial';
	}
}

export function smallserial(name?: string): PgSmallSerialBuilder {
	return new PgSmallSerialBuilder(name ?? '');
}
