import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { prepareOutFolder } from 'src/utils/utils-node';
import { type Column, createDDL, interimToDDL, type SqliteEntities } from '../../dialects/sqlite/ddl';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { CommandOutputCliError } from '../errors';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, printJsonOutput, sqliteSchemaError, warning } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
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
		resolver<SqliteEntities['tables']>('table'),
		resolver<Column>('column'),
		'default',
	);

	if (!isJsonMode()) {
		for (const w of warnings) {
			warning(w);
		}
	}

	if (config.explain && isJsonMode()) {
		const explainOutput = explainJsonOutput('sqlite', statements, []);
		printJsonOutput(explainOutput);
		return;
	}

	if (!isJsonMode()) {
		const explainMessage = explain('sqlite', groupedStatements, config.explain, []);
		if (explainMessage) {
			humanLog(explainMessage);
		}
	}

	if (config.explain) return;

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		renames,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		bundle: config.bundle,
		driver: config.driver,
		snapshots,
	});
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
	printJsonOutput({ sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
