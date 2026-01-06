import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgCidrBuilder extends PgColumnBuilder<{
	dataType: 'string cidr';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgCidrBuilder';

	constructor(name: string) {
		super(name, 'string cidr', 'PgCidr');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgCidr(table, this.config as any);
	}
}

export class PgCidr extends PgColumn<'string cidr'> {
	static override readonly [entityKind]: string = 'PgCidr';

	getSQLType(): string {
		return 'cidr';
	}
}

export function cidr(name?: string): PgCidrBuilder {
	return new PgCidrBuilder(name ?? '');
}
