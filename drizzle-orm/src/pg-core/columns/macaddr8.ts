import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgMacaddr8Builder extends PgColumnBuilder<{
	name: string;
	dataType: 'string macaddr8';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgMacaddr8Builder';

	constructor(name: string) {
		super(name, 'string macaddr8', 'PgMacaddr8');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgMacaddr8(table, this.config as any);
	}
}

export class PgMacaddr8<T extends ColumnBaseConfig<'string macaddr8'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgMacaddr8';

	getSQLType(): string {
		return 'macaddr8';
	}
}

export function macaddr8(name?: string): PgMacaddr8Builder {
	return new PgMacaddr8Builder(name ?? '');
}
