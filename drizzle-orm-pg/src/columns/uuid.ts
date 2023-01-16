import { ColumnConfig, sql } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';

import { AnyPgTable } from '~/table';

import { PgColumn, PgColumnBuilder } from './common';

export class PgUUIDBuilder<TData extends string = string>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	protected override $pgColumnBuilderBrand!: 'PgUUIDBuilder';

	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgUUID<TTableName, TData> {
		return new PgUUID(table, this.config);
	}
}

export class PgUUID<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid<T extends string = string>(name: string): PgUUIDBuilder<T> {
	return new PgUUIDBuilder(name);
}
