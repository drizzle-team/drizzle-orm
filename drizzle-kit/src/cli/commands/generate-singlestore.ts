import type { Column, Table, View } from 'src/dialects/mysql/ddl';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import type { JsonStatement } from 'src/dialects/mysql/statements';
import { ddlDiff, ddlDiffDry } from 'src/dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/singlestore/drizzle';
import { prepareSnapshot } from 'src/dialects/singlestore/serializer';
import { prepareOutFolder } from 'src/utils/utils-node';
import { isJsonMode } from '../context';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, printJsonOutput } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, casing, filenames } = config;
	const json = isJsonMode();
	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'singlestore',
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	let sqlStatements: string[] = [];
	let renames: string[] = [];
	let statements: JsonStatement[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];

	const diffResult = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Table>('table', 'public', 'generate', config.hints),
		resolver<Column>('column', 'public', 'generate', config.hints),
		resolver<View>('view', 'public', 'generate', config.hints),
		'default',
	);

	sqlStatements = diffResult.sqlStatements;
	renames = diffResult.renames;
	statements = diffResult.statements;
	groupedStatements = diffResult.groupedStatements;

	if (json && config.hints.hasMissingHints()) {
		config.hints.emitAndExit();
	}

	if (!config.explain) {
		writeResult({
			snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'singlestore',
			renames,
			snapshots,
		});
		return;
	}

	if (json) {
		if (sqlStatements.length === 0) {
			printJsonOutput({ status: 'no_changes', dialect: 'singlestore' });
			return;
		}
		printJsonOutput(explainJsonOutput('singlestore', statements, []));
		return;
	}

	const explainMessage = explain('singlestore', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables, config.casing);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl);
	printJsonOutput({ status: 'ok', dialect: 'singlestore', sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
