import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder } from './common.ts';

export type ClickHouseJsonBuilderInitial<TName extends string> = ClickHouseJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'ClickHouseJson';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
	// `JSON` can never itself be `Nullable`; absent keys are simply missing from the value.
	notNull: true;
}>;

export class ClickHouseJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'ClickHouseJson'>>
	extends ClickHouseColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'ClickHouseJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'ClickHouseJson');
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseJson<MakeColumnConfig<T, TTableName>> {
		return new ClickHouseJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class ClickHouseJson<T extends ColumnBaseConfig<'json', 'ClickHouseJson'>> extends ClickHouseColumn<T> {
	static override readonly [entityKind]: string = 'ClickHouseJson';

	override get supportsNullable(): boolean {
		return false;
	}

	getBaseSQLType(): string {
		return 'JSON';
	}

	override mapFromDriverValue(value: unknown): unknown {
		// ClickHouse's JSON output formats already hand back a parsed value; older servers and the
		// `String`-typed fallbacks hand back text.
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}

	override mapToDriverValue(value: unknown): SQL {
		return sql`CAST(${JSON.stringify(value)} AS JSON)`;
	}
}

/**
 * `JSON` — a semi-structured column that ClickHouse shreds into typed sub-columns on write.
 *
 * Use `$type` to give it a shape:
 *
 * ```ts
 * payload: json().$type<{ userId: number; tags: string[] }>(),
 * ```
 */
export function json(): ClickHouseJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): ClickHouseJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new ClickHouseJsonBuilder(name ?? '');
}
