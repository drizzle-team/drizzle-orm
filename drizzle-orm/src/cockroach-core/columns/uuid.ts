import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachUUIDBuilderInitial<TName extends string> = CockroachUUIDBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachUUID';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachUUIDBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachUUID'>>
	extends CockroachColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachUUIDBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'CockroachUUID');
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
	): CockroachUUID<MakeColumnConfig<T, TTableName>> {
		return new CockroachUUID<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachUUID<T extends ColumnBaseConfig<'string', 'CockroachUUID'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(): CockroachUUIDBuilderInitial<''>;
export function uuid<TName extends string>(name: TName): CockroachUUIDBuilderInitial<TName>;
export function uuid(name?: string) {
	return new CockroachUUIDBuilder(name ?? '');
}
