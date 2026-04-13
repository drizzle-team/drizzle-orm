import type { Column, Table, View } from 'src/dialects/mysql/ddl';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/singlestore/drizzle';
import { prepareSnapshot } from 'src/dialects/singlestore/serializer';
import { prepareOutFolder } from 'src/utils/utils-node';
import { isJsonMode } from '../mode';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, printJsonOutput } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
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

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Table>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		'default',
	);

	if (config.explain && isJsonMode()) {
		const explainOutput = explainJsonOutput('singlestore', statements, []);
		printJsonOutput(explainOutput);
		return;
	}

	if (!isJsonMode()) {
		const explainMessage = explain('singlestore', groupedStatements, config.explain, []);
		if (explainMessage) {
			humanLog(explainMessage);
		}
	}

	if (config.explain) return;

	writeResult({
		snapshot,
		sqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables, config.casing);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl);
	printJsonOutput({ sqlStatements });
	humanLog(sqlStatements.join('\n'));
};
