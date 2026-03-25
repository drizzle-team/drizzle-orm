import type { Column, Table, View } from 'src/dialects/mysql/ddl';
import { createDDL, interimToDDL } from 'src/dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/singlestore/drizzle';
import { prepareSnapshot } from 'src/dialects/singlestore/serializer';
import { prepareOutFolder } from 'src/utils/utils-node';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import { makeInverseResolver, withCapture } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames } = config;

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames);

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

	const tableRenames: { from: Table; to: Table }[] = [];
	const columnRenames: { from: Column; to: Column }[] = [];
	const viewRenames: { from: View; to: View }[] = [];

	const { sqlStatements, renames } = await ddlDiff(
		ddlPrev,
		ddlCur,
		withCapture(resolver<Table>('table'), tableRenames),
		withCapture(resolver<Column>('column'), columnRenames),
		withCapture(resolver<View>('view'), viewRenames),
		'default',
	);

	const { sqlStatements: downSqlStatements } = await ddlDiff(
		ddlCur,
		ddlPrev,
		makeInverseResolver(tableRenames),
		makeInverseResolver(columnRenames),
		makeInverseResolver(viewRenames),
		'default',
	);

	writeResult({
		snapshot,
		sqlStatements,
		downSqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	const schema = fromDrizzleSchema(res.tables);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl);
	console.log(sqlStatements.join('\n'));
};
