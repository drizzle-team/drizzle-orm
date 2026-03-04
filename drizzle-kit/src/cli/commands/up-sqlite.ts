import chalk from 'chalk';
import type { UpdateDeleteAction } from 'drizzle-orm/sqlite-core';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { transformOnUpdateDelete } from 'src/dialects/sqlite/grammar';
import { nameForPk } from 'src/dialects/sqlite/grammar';
import { prepareOutFolder, validateWithReport } from 'src/utils/utils-node';
import { createDDL } from '../../dialects/sqlite/ddl';
import {
	sqliteSchemaV5,
	type SQLiteSchemaV6,
	sqliteSchemaV6,
	type SqliteSnapshot,
} from '../../dialects/sqlite/snapshot';
import { mapEntries } from '../../utils';
import { embeddedMigrations } from './generate-common';
import { migrateToFoldersV3 } from './utils';

export const upSqliteHandler = (out: string) => {
	migrateToFoldersV3(out);

	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'sqlite');

	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]! as Record<string, any>,
		}))
		.forEach((it) => {
			const path = it.path;

			let result: SqliteSnapshot;
			if (it.raw['version'] === '5') {
				result = updateToV7(updateUpToV6(it.raw));
			} else if (it.raw['version'] === '6') {
				result = updateToV7(sqliteSchemaV6.parse(it.raw));
			} else {
				throw new Error(`unexpected version of SQLite snapshot: ${it.raw['version']}`);
			}

			console.log(`[${chalk.green('✓')}] ${path}`);
			writeFileSync(path, JSON.stringify(result, null, 2));
		});

	if (existsSync(join(out, 'migrations.js'))) {
		const js = embeddedMigrations(snapshots);
		writeFileSync(`${out}/migrations.js`, js);
	}

	console.log("Everything's fine 🐶🔥");
};

export const updateToV7 = (snapshot: SQLiteSchemaV6): SqliteSnapshot => {
	const ddl = createDDL();
	for (const table of Object.values(snapshot.tables)) {
		ddl.tables.push({
			name: table.name,
		});

		for (const column of Object.values(table.columns)) {
			let def: string | null = typeof column.default === 'undefined' ? null : String(column.default);

			ddl.columns.push({
				table: table.name,
				name: column.name,
				type: column.type,
				notNull: column.notNull && !column.primaryKey,
				default: def,
				autoincrement: column.autoincrement,
				generated: column.generated ?? null,
			});

			if (column.primaryKey) {
				ddl.pks.push({
					table: table.name,
					columns: [column.name],
					name: nameForPk(table.name),
					nameExplicit: false,
				});
			}
		}

		for (const pk of Object.values(table.compositePrimaryKeys)) {
			const implicit = pk.name === `${table.name}_${pk.columns.join('_')}_pk`;

			ddl.pks.push({
				table: table.name,
				name: pk.name!,
				columns: pk.columns,
				nameExplicit: !implicit,
			});
		}

		for (const index of Object.values(table.indexes)) {
			ddl.indexes.push({
				table: table.name,
				name: index.name,
				columns: index.columns.map((it) => ({ value: it, isExpression: false })),
				isUnique: index.isUnique,
				where: index.where,
				origin: 'manual',
			});
		}

		for (const unique of Object.values(table.uniqueConstraints)) {
			const implicit = unique.name === `${table.name}_${unique.columns.join('_')}_unique`;
			ddl.uniques.push({
				table: table.name,
				name: unique.name,
				columns: unique.columns,
				nameExplicit: !implicit,
			});
		}

		for (const check of Object.values(table.checkConstraints)) {
			ddl.checks.push({
				table: table.name,
				name: check.name,
				value: check.value,
			});
		}

		for (const fk of Object.values(table.foreignKeys)) {
			const nameExplicit =
				fk.name !== `${table.name}_${fk.columnsFrom.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`;
			ddl.fks.push({
				table: table.name,
				name: fk.name,
				columns: fk.columnsFrom,
				tableTo: fk.tableTo,
				columnsTo: fk.columnsTo,
				onDelete: transformOnUpdateDelete((fk.onDelete as UpdateDeleteAction | undefined) ?? 'no action'),
				onUpdate: transformOnUpdateDelete((fk.onUpdate as UpdateDeleteAction | undefined) ?? 'no action'),
				nameExplicit: nameExplicit,
			});
		}
	}

	for (const view of Object.values(snapshot.views)) {
		ddl.views.push({
			name: view.name,
			definition: view.definition,
			isExisting: view.isExisting,
			error: null,
		});
	}

	const renames = [...Object.entries(snapshot._meta.tables), ...Object.entries(snapshot._meta.columns)].map(
		([key, value]) => {
			return `${key}->${value}`;
		},
	);

	return {
		dialect: 'sqlite',
		id: snapshot.id,
		prevIds: [snapshot.prevId],
		version: '7',
		ddl: ddl.entities.list(),
		renames: renames,
	};
};

const updateUpToV6 = (json: object): SQLiteSchemaV6 => {
	const schema = sqliteSchemaV5.parse(json);

	const tables = mapEntries(schema.tables, (tableKey, table) => {
		const columns = mapEntries(table.columns, (key, value) => {
			if (
				value.default
				&& (typeof value.default === 'object' || Array.isArray(value.default))
			) {
				value.default = `'${JSON.stringify(value.default)}'`;
			}
			return [key, value];
		});
		table.columns = columns;
		return [tableKey, table];
	});

	return {
		...schema,
		version: '6',
		dialect: 'sqlite',
		tables: tables,
		views: {},
	};
};
