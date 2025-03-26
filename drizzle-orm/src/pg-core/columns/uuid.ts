import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { sql } from '~/sql/sql.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgUUIDBuilderInitial<TName extends string> = PgUUIDBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgUUID';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgUUIDBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgUUID'>> extends PgColumnBuilder<T> {
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

	getSQLType(): string {
		return 'uuid';
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgUUID<MakeColumnConfig<T, TTableName>> {
		return new PgUUID<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgUUID<T extends ColumnBaseConfig<'string', 'PgUUID'>> extends PgColumn<T> {
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
