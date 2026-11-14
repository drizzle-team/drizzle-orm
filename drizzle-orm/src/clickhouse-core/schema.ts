import { entityKind, is } from '~/entity.ts';
import { type ClickHouseTableFn, clickhouseTableWithSchema } from './table.ts';

/**
 * A ClickHouse database, which is what the `SCHEMA`/`DATABASE` qualifier in a table name refers to.
 */
export class ClickHouseSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'ClickHouseSchema';

	constructor(
		public readonly schemaName: TName,
	) {}

	table: ClickHouseTableFn<TName> = (name, columns, extraConfig) => {
		return clickhouseTableWithSchema(name, columns, extraConfig, this.schemaName);
	};
}

/**
 * Declares a ClickHouse database to qualify tables with.
 *
 * ```ts
 * export const analytics = clickhouseDatabase('analytics');
 * export const events = analytics.table('events', { … });
 * ```
 */
export function clickhouseDatabase<TName extends string>(name: TName) {
	return new ClickHouseSchema(name);
}

/** @see clickhouseDatabase */
export const clickhouseSchema = clickhouseDatabase;

export function isClickHouseSchema(obj: unknown): obj is ClickHouseSchema {
	return is(obj, ClickHouseSchema);
}
