import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { prepareOutFolder } from 'src/utils/utils-node';
import { type Column, createDDL, interimToDDL, type SqliteEntities } from '../../dialects/sqlite/ddl';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { isJsonMode } from '../context';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, printJsonOutput, sqliteSchemaError, warning } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const dialect = config.dialect === 'turso' ? 'turso' : 'sqlite';
	const json = isJsonMode();
	const { out: outFolder, casing, filenames } = config;
	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSqliteSnapshot(
		snapshots,
		filenames,
		casing,
	);
	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect,
			bundle: config.bundle,
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	const { sqlStatements, warnings, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<SqliteEntities['tables']>('table', 'public', 'generate', config.hints),
		resolver<Column>('column', 'public', 'generate', config.hints),
		'default',
	);

	if (json && config.hints.hasMissingHints()) {
		config.hints.emitAndExit();
	}

	if (!json) {
		for (const w of warnings) {
			warning(w);
		}
	}

	if (!config.explain) {
		writeResult({
			snapshot: snapshot,
			sqlStatements,
			renames,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect,
			bundle: config.bundle,
			driver: config.driver,
			snapshots,
		});
		return;
	}

	if (json) {
		if (sqlStatements.length === 0) {
			printJsonOutput({ status: 'no_changes', dialect });
			return;
		}
		printJsonOutput(explainJsonOutput(dialect, statements, []));
		return;
	}

	const explainMessage = explain('sqlite', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables, res.views, config.casing);
	const { ddl, errors } = interimToDDL(schema);

	if (errors.length > 0) {
		console.log(errors.map((it) => sqliteSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
