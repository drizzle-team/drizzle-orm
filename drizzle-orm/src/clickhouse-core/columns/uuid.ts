import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	HasDefault,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import { castFromString } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ClickHouseUUIDBuilderInitial<TName extends string> = ClickHouseUUIDBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'ClickHouseUUID';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class ClickHouseUUIDBuilder<T extends ColumnBuilderBaseConfig<'string', 'ClickHouseUUID'>>
	extends ClickHouseColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'ClickHouseUUIDBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'ClickHouseUUID');
	}

	/** Adds `DEFAULT generateUUIDv4()` to the column definition. */
	defaultRandom(): HasDefault<this> {
		return this.default(sql`generateUUIDv4()`);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseUUID<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseUUID<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseUUID<T extends ColumnBaseConfig<'string', 'ClickHouseUUID'>> extends ClickHouseColumn<T> {
	static override readonly [entityKind]: string = 'ClickHouseUUID';

	getBaseSQLType(): string {
		return 'UUID';
	}

	override mapToDriverValue(value: string): SQL {
		// A bare string literal would be compared as `String` against `UUID` and rejected.
		return castFromString('toUUID', value);
	}
}

/** `UUID` — a 16-byte universally unique identifier, surfaced as its canonical string form. */
export function uuid(): ClickHouseUUIDBuilderInitial<''>;
export function uuid<TName extends string>(name: TName): ClickHouseUUIDBuilderInitial<TName>;
export function uuid(name?: string) {
	return new ClickHouseUUIDBuilder(name ?? '');
}
