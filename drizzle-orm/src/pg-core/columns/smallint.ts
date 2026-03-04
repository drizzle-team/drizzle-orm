import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBuilder } from './int.common.ts';

export class PgSmallIntBuilder extends PgIntColumnBuilder<{
	dataType: 'number int16';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'PgSmallIntBuilder';

	constructor(name: string) {
		super(name, 'number int16', 'PgSmallInt');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgSmallInt(table, this.config as any);
	}
}

export class PgSmallInt extends PgColumn<'number int16'> {
	static override readonly [entityKind]: string = 'PgSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}
export function smallint(name?: string): PgSmallIntBuilder {
	return new PgSmallIntBuilder(name ?? '');
}
