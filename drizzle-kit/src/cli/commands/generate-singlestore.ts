import type { Column, Table, View } from '../../dialects/mysql/ddl';
import { createDDL, interimToDDL } from '../../dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/singlestore/drizzle';
import { prepareSnapshot } from '../../dialects/singlestore/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames } = config;
	const json = outputFormat() === 'json';
	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames);

	if (config.custom) {
		return writeResult({
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
	}

	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Table>('table', 'public', config.hints),
		resolver<Column>('column', 'public', config.hints),
		resolver<View>('view', 'public', config.hints),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	if (!config.explain) {
		return writeResult({
			snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'singlestore',
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'singlestore' };
		}
		return explainJsonOutput('singlestore', statements, []);
	}

	const explainMessage = explain('singlestore', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'singlestore' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl);
	console.log(sqlStatements.join('\n'));
};
