import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgCidrBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'string';
	data: string;
	driverParam: string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgCidrBuilder';

	constructor(name: string) {
		super(name, 'string', 'PgCidr');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgCidr(table, this.config as any);
	}
}

export class PgCidr<T extends ColumnBaseConfig<'string'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgCidr';

	getSQLType(): string {
		return 'cidr';
	}
}

export function cidr(name?: string): PgCidrBuilder {
	return new PgCidrBuilder(name ?? '');
}
