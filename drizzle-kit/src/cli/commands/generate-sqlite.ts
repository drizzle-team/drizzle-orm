import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import type { JsonStatement } from 'src/dialects/sqlite/statements';
import { prepareOutFolder } from 'src/utils/utils-node';
import { type Column, createDDL, interimToDDL, type SqliteEntities } from '../../dialects/sqlite/ddl';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, printJsonOutput, sqliteSchemaError, warning } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const dialect = config.dialect === 'turso' ? 'turso' : 'sqlite';
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
			json: config.json,
			name: config.name,
			breakpoints: config.breakpoints,
			bundle: config.bundle,
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}
	let sqlStatements: string[] = [];
	let warnings: string[] = [];
	let renames: string[] = [];
	let statements: JsonStatement[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];

	const diffResult = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<SqliteEntities['tables']>('table', 'public', 'generate'),
		resolver<Column>('column', 'public', 'generate'),
		'default',
	);

	sqlStatements = diffResult.sqlStatements;
	warnings = diffResult.warnings;
	renames = diffResult.renames;
	statements = diffResult.statements;
	groupedStatements = diffResult.groupedStatements;

	if (config.json && config.hints.hasMissingHints()) {
		config.hints.emitAndExit();
	}

	if (!config.json) {
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
			json: config.json,
			name: config.name,
			breakpoints: config.breakpoints,
			bundle: config.bundle,
			driver: config.driver,
			snapshots,
		});
		return;
	}

	if (config.json) {
		printJsonOutput(explainJsonOutput(dialect, statements, []), true);
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
		throw new CommandOutputCliError('export', errors.map((it) => sqliteSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'sqlite',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	printJsonOutput({ sqlStatements }, config.json);
	humanLog(sqlStatements.join('\n'));
};
