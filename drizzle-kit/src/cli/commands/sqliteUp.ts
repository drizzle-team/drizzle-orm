import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { mapEntries } from 'src/global';
import { prepareOutFolder, validateWithReport } from 'src/utils-node';
import { createDDL, SqliteSnapshot } from '../../dialects/sqlite/ddl';
import { sqliteSchemaV5, type SQLiteSchemaV6, sqliteSchemaV6  } from '../../dialects/sqlite/snapshot';

export const upSqliteHandler = (out: string) => {
	const { snapshots } = prepareOutFolder(out, 'sqlite');
	const report = validateWithReport(snapshots, 'sqlite');

	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]!! as Record<string, any>,
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

	console.log("Everything's fine 🐶🔥");
};

const updateToV7 = (snapshot: SQLiteSchemaV6): SqliteSnapshot => {
	const ddl = createDDL();
	for (const table of Object.values(snapshot.tables)) {
		ddl.tables.insert({
			name: table.name,
		});

		for (const column of Object.values(table.columns)) {
			ddl.columns.insert({
				table: table.name,
				name: column.name,
				type: column.type,
				notNull: column.notNull,
				primaryKey: column.primaryKey,
				default: column.default,
				autoincrement: column.autoincrement,
				generated: column.generated ?? null,
			});
		}

		for (const pk of Object.values(table.compositePrimaryKeys)) {
			ddl.pks.insert({
				table: table.name,
				name: pk.name,
				columns: pk.columns,
			});
		}

		for (const index of Object.values(table.indexes)) {
			ddl.indexes.insert({
				table: table.name,
				name: index.name,
				columns: index.columns.map((it) => ({ value: it, expression: false })),
				isUnique: index.isUnique,
				where: index.where,
			});
		}

		for (const unique of Object.values(table.uniqueConstraints)) {
			ddl.uniques.insert({
				table: table.name,
				name: unique.name,
				columns: unique.columns,
			});
		}

		for (const check of Object.values(table.checkConstraints)) {
			ddl.checks.insert({
				table: table.name,
				name: check.name,
				value: check.value,
			});
		}

		for (const fk of Object.values(table.foreignKeys)) {
			ddl.fks.insert({
				table: table.name,
				name: fk.name,
				tableFrom: fk.tableFrom,
				columnsFrom: fk.columnsFrom,
				tableTo: fk.tableTo,
				columnsTo: fk.columnsTo,
				onDelete: fk.onDelete,
				onUpdate: fk.onUpdate,
			});
		}
	}

	for (const view of Object.values(snapshot.views)) {
		ddl.views.insert({
			name: view.name,
			definition: view.definition,
			isExisting: view.isExisting,
		});
	}

	return {
		dialect: 'sqlite',
		id: snapshot.id,
		prevId: snapshot.prevId,
		version: '7',
		ddl: ddl.entities.list(),
		meta: snapshot._meta,
	};
};

const updateUpToV6 = (json: Object): SQLiteSchemaV6 => {
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
