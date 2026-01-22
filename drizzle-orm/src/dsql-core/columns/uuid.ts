import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder, type SetHasDefault } from './common.ts';

export class DSQLUUIDBuilder extends DSQLColumnBuilder<{
	dataType: 'string uuid';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLUUIDBuilder';

	constructor(name: string) {
		super(name, 'string uuid', 'DSQLUUID');
	}

	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): SetHasDefault<this> {
		return this.default(sql`gen_random_uuid()`) as SetHasDefault<this>;
	}

	/** @internal */
	override build(table: DSQLTable): DSQLUUID {
		return new DSQLUUID(table, this.config as any);
	}
}

export class DSQLUUID extends DSQLColumn<'string uuid'> {
	static override readonly [entityKind]: string = 'DSQLUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(name?: string): DSQLUUIDBuilder {
	return new DSQLUUIDBuilder(name ?? '');
}
