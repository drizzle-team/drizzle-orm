import { is } from '~/entity.ts';
import { PgTable } from '~/pg-core/table.ts';
import type { AnyRelations } from '~/relations.ts';
import { SQL } from '~/sql/sql.ts';
import { Subquery } from '~/subquery.ts';
import { Table, TableSchema } from '~/table.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { PgCodecs } from './codecs.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { Index } from './indexes.ts';
import { IndexBuilder } from './indexes.ts';
import { PgPolicy } from './policies.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import type { PgViewBase } from './view-base.ts';
import { PgMaterializedViewConfig, PgViewConfig } from './view-common.ts';
import type { PgMaterializedView, PgView } from './view.ts';

export function getTableConfig<TTable extends PgTable>(table: TTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[PgTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];
	const policies: PgPolicy[] = [];
	const enableRLS: boolean = table[PgTable.Symbol.EnableRLS];

	const extraConfigBuilder = table[PgTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[Table.Symbol.ExtraConfigColumns]);
		const extraValues = Array.isArray(extraConfig) ? extraConfig.flat(1) as any[] : Object.values(extraConfig);
		for (const builder of extraValues) {
			if (is(builder, IndexBuilder)) {
				indexes.push(builder.build(table));
			} else if (is(builder, CheckBuilder)) {
				checks.push(builder.build(table));
			} else if (is(builder, UniqueConstraintBuilder)) {
				uniqueConstraints.push(builder.build(table));
			} else if (is(builder, PrimaryKeyBuilder)) {
				primaryKeys.push(builder.build(table));
			} else if (is(builder, ForeignKeyBuilder)) {
				foreignKeys.push(builder.build(table));
			} else if (is(builder, PgPolicy)) {
				policies.push(builder);
			}
		}
	}

	return {
		columns,
		indexes,
		foreignKeys,
		checks,
		primaryKeys,
		uniqueConstraints,
		name,
		schema,
		policies,
		enableRLS,
	};
}

export function extractUsedTable(table: PgTable | Subquery | PgViewBase | SQL): string[] {
	if (is(table, PgTable)) {
		return [
			table[TableSchema] ? `${table[TableSchema]}.${table[Table.Symbol.BaseName]}` : table[Table.Symbol.BaseName],
		];
	}
	if (is(table, Subquery)) {
		return table._.usedTables ?? [];
	}
	if (is(table, SQL)) {
		return table.usedTables ?? [];
	}
	return [];
}

export function getViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: PgView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[PgViewConfig],
	};
}

export function getMaterializedViewConfig<
	TName extends string = string,
	TExisting extends boolean = boolean,
>(view: PgMaterializedView<TName, TExisting>) {
	return {
		...view[ViewBaseConfig],
		...view[PgMaterializedViewConfig],
	};
}

function parsePgArrayValue(arrayString: string, startFrom: number, inQuotes: boolean): [string, number] {
	for (let i = startFrom; i < arrayString.length; i++) {
		const char = arrayString[i];

		if (char === '\\') {
			i++;
			continue;
		}

		if (char === '"') {
			return [arrayString.slice(startFrom, i).replace(/\\/g, ''), i + 1];
		}

		if (inQuotes) {
			continue;
		}

		if (char === ',' || char === '}') {
			return [arrayString.slice(startFrom, i).replace(/\\/g, ''), i];
		}
	}

	return [arrayString.slice(startFrom).replace(/\\/g, ''), arrayString.length];
}

export function parsePgNestedArray(arrayString: string, startFrom = 0): [any[], number] {
	const result: any[] = [];
	let i = startFrom;
	let lastCharIsComma = false;

	while (i < arrayString.length) {
		const char = arrayString[i];

		if (char === ',') {
			if (lastCharIsComma || i === startFrom) {
				result.push('');
			}
			lastCharIsComma = true;
			i++;
			continue;
		}

		lastCharIsComma = false;

		if (char === '\\') {
			i += 2;
			continue;
		}

		if (char === '"') {
			const [value, startFrom] = parsePgArrayValue(arrayString, i + 1, true);
			result.push(value);
			i = startFrom;
			continue;
		}

		if (char === '}') {
			return [result, i + 1];
		}

		if (char === '{') {
			const [value, startFrom] = parsePgNestedArray(arrayString, i + 1);
			result.push(value);
			i = startFrom;
			continue;
		}

		const [value, newStartFrom] = parsePgArrayValue(arrayString, i, false);
		result.push(value);
		i = newStartFrom;
	}

	return [result, i];
}

export function parsePgArray(arrayString: string): any[] {
	const [result] = parsePgNestedArray(arrayString, 1);
	return result;
}

export function makePgArray(array: any[]): string {
	return `{${
		array.map((item) => {
			if (Array.isArray(item)) {
				return makePgArray(item);
			}

			if (typeof item === 'string') {
				return `"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
			}

			return `${item}`;
		}).join(',')
	}}`;
}

export type DrizzlePgConfig<TRelations extends AnyRelations> =
	& Omit<DrizzleConfig<Record<string, never>, TRelations>, 'schema'>
	& { codecs?: PgCodecs | undefined };
