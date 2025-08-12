import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgMacaddrBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'string macaddr';
	data: string;
	driverParam: string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgMacaddrBuilder';

	constructor(name: string) {
		super(name, 'string macaddr', 'PgMacaddr');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgMacaddr(table, this.config as any);
	}
}

export class PgMacaddr<T extends ColumnBaseConfig<'string macaddr'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgMacaddr';

	getSQLType(): string {
		return 'macaddr';
	}
}

export function macaddr(name?: string): PgMacaddrBuilder {
	return new PgMacaddrBuilder(name ?? '');
}
