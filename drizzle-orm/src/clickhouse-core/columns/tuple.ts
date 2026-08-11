import type { AnyClickHouseTable } from '~/clickhouse-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import { escapeClickHouseIdentifier } from '../literals.ts';
import { ClickHouseColumn, ClickHouseColumnBuilder, type ClickHouseColumnBuilderBase } from './common.ts';
import type { ElementData } from './nullable.ts';

/** The members of a tuple: positional when given as an array, named when given as an object. */
export type ClickHouseTupleMembers =
	| readonly [ClickHouseColumnBuilderBase, ...ClickHouseColumnBuilderBase[]]
	| Record<string, ClickHouseColumnBuilderBase>;

export type ClickHouseTupleData<TMembers extends ClickHouseTupleMembers> = {
	-readonly [K in keyof TMembers]: TMembers[K] extends ClickHouseColumnBuilderBase ? ElementData<TMembers[K]> : never;
};

export type ClickHouseTupleBuilderInitial<TName extends string, TMembers extends ClickHouseTupleMembers> =
	ClickHouseTupleBuilder<
		{
			name: TName;
			dataType: 'json';
			columnType: 'ClickHouseTuple';
			data: ClickHouseTupleData<TMembers>;
			driverParam: unknown;
			enumValues: undefined;
			// `Tuple(...)` can never itself be `Nullable`.
			notNull: true;
		},
		TMembers
	>;

export class ClickHouseTupleBuilder<
	T extends ColumnBuilderBaseConfig<'json', 'ClickHouseTuple'>,
	TMembers extends ClickHouseTupleMembers,
> extends ClickHouseColumnBuilder<T, { members: TMembers }> {
	static override readonly [entityKind]: string = 'ClickHouseTupleBuilder';

	constructor(name: T['name'], members: TMembers) {
		super(name, 'json', 'ClickHouseTuple');
		this.config.members = members;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyClickHouseTable<{ name: TTableName }>,
	): ClickHouseTuple<MakeColumnConfig<T, TTableName>> {
		const members = this.config.members as ClickHouseTupleMembers;
		const isNamed = !Array.isArray(members);
		const entries: [string | undefined, ClickHouseColumn][] = Object.entries(members).map(([key, builder]) => [
			isNamed ? key : undefined,
			(builder as unknown as ClickHouseColumnBuilder).markAsElement().build(table),
		]);
		return new ClickHouseTuple<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			entries,
			isNamed,
		);
	}
}

export class ClickHouseTuple<T extends ColumnBaseConfig<'json', 'ClickHouseTuple'>> extends ClickHouseColumn<T> {
	static override readonly [entityKind]: string = 'ClickHouseTuple';

	constructor(
		table: AnyClickHouseTable<{ name: T['tableName'] }>,
		config: ColumnBuilderRuntimeConfig<any, any>,
		/** Members in declaration order; the name is set only for named tuples. */
		readonly members: [string | undefined, ClickHouseColumn][],
		readonly isNamed: boolean,
	) {
		super(table as any, config);
	}

	/** ClickHouse rejects `Nullable(Tuple(...))`. */
	override get supportsNullable(): boolean {
		return false;
	}

	getBaseSQLType(): string {
		const members = this.members
			.map(([name, column]) =>
				name === undefined
					? column.getSQLType()
					: `${escapeClickHouseIdentifier(name)} ${column.getSQLType()}`
			)
			.join(', ');
		return `Tuple(${members})`;
	}

	override mapFromDriverValue(value: unknown[] | Record<string, unknown>): unknown {
		// ClickHouse returns positional tuples as JSON arrays and named tuples as JSON objects.
		if (this.isNamed && !Array.isArray(value)) {
			const result: Record<string, unknown> = {};
			for (const [name, column] of this.members) {
				const raw = (value as Record<string, unknown>)[name!];
				result[name!] = raw === null || raw === undefined ? null : column.mapFromDriverValue(raw);
			}
			return result;
		}

		const values = Array.isArray(value) ? value : Object.values(value);
		return this.members.map(([, column], index) => {
			const raw = values[index];
			return raw === null || raw === undefined ? null : column.mapFromDriverValue(raw);
		});
	}

	override mapToDriverValue(value: unknown[] | Record<string, unknown>): SQL {
		const values = Array.isArray(value) ? value : this.members.map(([name]) => (value as any)[name!]);
		const args = this.members.map(([, column], index) => {
			const raw = values[index];
			return raw === null || raw === undefined ? sql`NULL` : sql`${column.mapToDriverValue(raw)}`;
		});
		return sql`tuple(${sql.join(args, sql`, `)})`;
	}
}

/**
 * `Tuple(...)` — a fixed-shape record.
 *
 * Positional members are declared with an array and surface as a TypeScript tuple; named members are
 * declared with an object and surface as an object.
 *
 * ```ts
 * point: tuple([float64(), float64()]),              // Tuple(Float64, Float64)
 * bounds: tuple({ min: int32(), max: int32() }),     // Tuple(`min` Int32, `max` Int32)
 * ```
 */
export function tuple<TMembers extends ClickHouseTupleMembers>(
	members: TMembers,
): ClickHouseTupleBuilderInitial<'', TMembers>;
export function tuple<TName extends string, TMembers extends ClickHouseTupleMembers>(
	name: TName,
	members: TMembers,
): ClickHouseTupleBuilderInitial<TName, TMembers>;
export function tuple(a: string | ClickHouseTupleMembers, b?: ClickHouseTupleMembers) {
	return typeof a === 'string'
		? new ClickHouseTupleBuilder(a, b!)
		: new ClickHouseTupleBuilder('', a);
}
