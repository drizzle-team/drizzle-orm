import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbUUIDBuilderInitial<TName extends string> = CockroachDbUUIDBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbUUID';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbUUIDBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDbUUID'>>
	extends CockroachDbColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbUUIDBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'CockroachDbUUID');
	}

	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbUUID<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbUUID<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbUUID<T extends ColumnBaseConfig<'string', 'CockroachDbUUID'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(): CockroachDbUUIDBuilderInitial<''>;
export function uuid<TName extends string>(name: TName): CockroachDbUUIDBuilderInitial<TName>;
export function uuid(name?: string) {
	return new CockroachDbUUIDBuilder(name ?? '');
}
