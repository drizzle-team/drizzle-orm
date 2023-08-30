import { is } from '~/entity.ts';
import { PgTable } from '~/pg-core/table.ts';
import { Table } from '~/table.ts';
import { ViewBaseConfig } from '~/view.ts';
import { type Check, CheckBuilder } from './checks.ts';
import type { AnyPgColumn } from './columns/index.ts';
import { type ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import { type Index, IndexBuilder } from './indexes.ts';
import { type PrimaryKey, PrimaryKeyBuilder } from './primary-keys.ts';
import { type UniqueConstraint, UniqueConstraintBuilder } from './unique-constraint.ts';
import { type PgMaterializedView, PgMaterializedViewConfig, type PgView, PgViewConfig } from './view.ts';

export function getTableConfig<TTable extends PgTable>(table: TTable) {
	const columns = Object.values(table[Table.Symbol.Columns]);
	const indexes: Index[] = [];
	const checks: Check[] = [];
	const primaryKeys: PrimaryKey[] = [];
	const foreignKeys: ForeignKey[] = Object.values(table[PgTable.Symbol.InlineForeignKeys]);
	const uniqueConstraints: UniqueConstraint[] = [];
	const name = table[Table.Symbol.Name];
	const schema = table[Table.Symbol.Schema];

	const extraConfigBuilder = table[PgTable.Symbol.ExtraConfigBuilder];

	if (extraConfigBuilder !== undefined) {
		const extraConfig = extraConfigBuilder(table[Table.Symbol.Columns]);
		for (const builder of Object.values(extraConfig)) {
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
	};
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

			if (typeof item === 'string' && item.includes(',')) {
				return `"${item.replace(/"/g, '\\"')}"`;
			}

			return `${item}`;
		}).join(',')
	}}`;
}

export type ColumnsWithTable<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyPgColumn<{ tableName: TTableName }>[],
> = { [Key in keyof TColumns]: AnyPgColumn<{ tableName: TForeignTableName }> };
