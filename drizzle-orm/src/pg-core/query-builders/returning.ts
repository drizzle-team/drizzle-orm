import { aliasedTable } from '~/alias.ts';
import type { CodecsCollection } from '~/codecs.ts';
import type { PostgresType } from '~/pg-core/codecs.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { type InferSelectModel, Table } from '~/table.ts';
import { orderSelectedFields, type RequireAtLeastOne, type RowsMapper } from '~/utils.ts';
import type { PgColumn } from '../columns/common.ts';
import type { SelectedFields, SelectedFieldsOrdered } from './select.types.ts';

/** @internal */
export const pgReturningOldAlias = '__drizzle_old';
/** @internal */
export const pgReturningNewAlias = '__drizzle_new';

const oldPresenceField = '__drizzle_old_present';
const newPresenceField = '__drizzle_new_present';

export type PgReturningOldNewConfig = RequireAtLeastOne<{
	old: true;
	new: true;
}>;

type PgReturningRow<TRow, TNullable extends boolean> = TNullable extends true ? TRow | null : TRow;

export type PgReturningOldNewResult<
	TTable extends PgTable,
	TConfig extends PgReturningOldNewConfig,
	TOldNullable extends boolean,
	TNewNullable extends boolean,
> = {
	[K in Extract<keyof TConfig, 'old' | 'new'>]: K extends 'old' ? PgReturningRow<InferSelectModel<TTable>, TOldNullable>
		: PgReturningRow<InferSelectModel<TTable>, TNewNullable>;
};

/** @internal */
export interface PgReturningOldNewSelection {
	returningFields: SelectedFields;
	returning: SelectedFieldsOrdered;
}

/** @internal */
export function isPgReturningOldNewConfig(value: unknown): value is PgReturningOldNewConfig {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const config = value as Record<string, unknown>;
	if (config['old'] !== true && config['new'] !== true) {
		return false;
	}

	for (const [key, field] of Object.entries(config)) {
		if ((key !== 'old' && key !== 'new') || field !== true) {
			throw new Error(
				'PostgreSQL OLD/NEW returning only supports the `old` and `new` whole-row fields',
			);
		}
	}

	return true;
}

/** @internal */
export function buildPgReturningOldNewSelection(
	table: PgTable,
	config: PgReturningOldNewConfig,
	codecs: CodecsCollection<PostgresType>,
): PgReturningOldNewSelection {
	const returningFields: SelectedFields = {};
	const returningWithPresence: SelectedFields = {};

	for (
		const [key, alias] of [
			['old', pgReturningOldAlias],
			['new', pgReturningNewAlias],
		] as const
	) {
		if (config[key] !== true) {
			continue;
		}

		const aliased = aliasedTable(table, alias);
		const originalColumns = table[Table.Symbol.Columns] as Record<string, PgColumn>;
		const aliasedColumns = aliased[Table.Symbol.Columns] as Record<string, PgColumn>;
		const fields: Record<string, SQL.Aliased> = {};

		for (const [index, [columnKey, column]] of Object.entries(originalColumns).entries()) {
			fields[columnKey] = sql`${aliasedColumns[columnKey]!}`
				.mapWith(column)
				.as(`__drizzle_${key}_${index}`);
		}

		returningFields[key] = fields;
		returningWithPresence[key] = fields;
	}

	if (config.old === true) {
		returningWithPresence[oldPresenceField] = sql<boolean>`${sql.identifier(pgReturningOldAlias)}.${
			sql.identifier('tableoid')
		} is not null`
			.as(oldPresenceField);
	}

	if (config.new === true) {
		returningWithPresence[newPresenceField] = sql<boolean>`${sql.identifier(pgReturningNewAlias)}.${
			sql.identifier('tableoid')
		} is not null`
			.as(newPresenceField);
	}

	return {
		returningFields,
		returning: orderSelectedFields<PgColumn>(returningWithPresence, undefined, codecs),
	};
}

/** @internal */
export function createPgReturningOldNewMapper<TResult>(
	mapper: RowsMapper<TResult> | undefined,
	config: PgReturningOldNewConfig,
): RowsMapper<TResult> {
	return (rows) => {
		const result = (mapper ? mapper(rows) : rows) as Record<string, unknown>[];

		for (const row of result) {
			if (config.old === true) {
				if (row[oldPresenceField] !== true) {
					row['old'] = null;
				}
				delete row[oldPresenceField];
			}

			if (config.new === true) {
				if (row[newPresenceField] !== true) {
					row['new'] = null;
				}
				delete row[newPresenceField];
			}
		}

		return result as TResult;
	};
}
