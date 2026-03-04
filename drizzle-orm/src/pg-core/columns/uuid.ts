import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { sql } from '~/sql/sql.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgUUIDBuilder extends PgColumnBuilder<{
	dataType: 'string uuid';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgUUIDBuilder';

	constructor(name: string) {
		super(name, 'string uuid', 'PgUUID');
	}

	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgUUID(table, this.config as any);
	}
}

export class PgUUID extends PgColumn<'string uuid'> {
	static override readonly [entityKind]: string = 'PgUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(name?: string): PgUUIDBuilder {
	return new PgUUIDBuilder(name ?? '');
}
