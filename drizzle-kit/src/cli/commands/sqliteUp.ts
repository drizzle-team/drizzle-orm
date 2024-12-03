import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { mapEntries } from 'src/global';
import { SQLiteSchema, sqliteSchemaV5 } from 'src/serializer/sqliteSchema';
import { prepareOutFolder, validateWithReport } from 'src/utils';

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
			const result = updateUpToV6(it.raw);

			console.log(`[${chalk.green('✓')}] ${path}`);

			writeFileSync(path, JSON.stringify(result, null, 2));
		});

	console.log("Everything's fine 🐶🔥");
};

const updateUpToV6 = (json: Record<string, any>): SQLiteSchema => {
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
