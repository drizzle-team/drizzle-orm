import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachUUIDBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'string uuid';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachUUIDBuilder';

	constructor(name: string) {
		super(name, 'string uuid', 'CockroachUUID');
	}

	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachUUID(
			table,
			this.config,
		);
	}
}

export class CockroachUUID<T extends ColumnBaseConfig<'string uuid'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(name?: string) {
	return new CockroachUUIDBuilder(name ?? '');
}
