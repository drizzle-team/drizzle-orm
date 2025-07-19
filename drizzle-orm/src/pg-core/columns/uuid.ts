import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { sql } from '~/sql/sql.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgUUIDBuilderInitial<TName extends string> = PgUUIDBuilder<{
	name: TName;
	dataType: 'string';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgUUIDBuilder<T extends ColumnBuilderBaseConfig<'string'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgUUIDBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgUUID');
	}

	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgUUID(table, this.config as any);
	}
}

export class PgUUID<T extends ColumnBaseConfig<'string'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(): PgUUIDBuilderInitial<''>;
export function uuid<TName extends string>(name: TName): PgUUIDBuilderInitial<TName>;
export function uuid(name?: string) {
	return new PgUUIDBuilder(name ?? '');
}
