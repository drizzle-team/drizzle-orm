import type { Column, Table, View } from 'src/dialects/mysql/ddl';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import type { JsonStatement } from 'src/dialects/mysql/statements';
import { ddlDiff, ddlDiffDry } from 'src/dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/singlestore/drizzle';
import { prepareSnapshot } from 'src/dialects/singlestore/serializer';
import { prepareOutFolder } from 'src/utils/utils-node';
import { JsonModeUnsupportedCliError } from '../errors';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { explain, humanLog, printJsonOutput } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	if (isJsonMode()) {
		throw new JsonModeUnsupportedCliError({ dialect: 'singlestore', command: 'generate' });
	}

	const { out: outFolder, casing, filenames } = config;
	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	let sqlStatements: string[] = [];
	let renames: string[] = [];
	let groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[] = [];

	const diffResult = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Table>('table', 'public', 'generate'),
		resolver<Column>('column', 'public', 'generate'),
		resolver<View>('view', 'public', 'generate'),
		'default',
	);

	sqlStatements = diffResult.sqlStatements;
	renames = diffResult.renames;
	groupedStatements = diffResult.groupedStatements;

	if (!config.explain) {
		writeResult({
			snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			renames,
			snapshots,
		});
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
	printJsonOutput({ sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
