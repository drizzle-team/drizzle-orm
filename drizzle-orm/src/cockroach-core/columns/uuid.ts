import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { CockroachColumn, type CockroachColumnBaseConfig, CockroachColumnBuilder } from './common.ts';

export class CockroachUUIDBuilder extends CockroachColumnBuilder<{
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

export class CockroachUUID<T extends CockroachColumnBaseConfig<'string uuid'>>
	extends CockroachColumn<'string uuid', T>
{
	static override readonly [entityKind]: string = 'CockroachUUID';

	/** @internal */
	override readonly codec = 'uuid';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(name?: string) {
	return new CockroachUUIDBuilder(name ?? '');
}
