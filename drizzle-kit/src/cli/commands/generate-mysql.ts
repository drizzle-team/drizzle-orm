import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/mysql/drizzle';
import { prepareSnapshot } from 'src/dialects/mysql/serializer';
import { prepareFilenames, prepareOutFolder } from 'src/utils/utils-node';
import { Column, createDDL, interimToDDL, type Table, View } from '../../dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/mysql/diff';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, snapshotPrev, custom } = await prepareSnapshot(snapshots, schemaPath, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			type: 'custom',
			prefixMode: config.prefix,
			renames: [],
			snapshots,
		});
		return;
	}

	const { sqlStatements, renames } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Table>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		'default',
	);

	writeResult({
		snapshot,
		sqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		prefixMode: config.prefix,
		renames,
		snapshots,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const filenames = prepareFilenames(config.schema);
	const res = await prepareFromSchemaFiles(filenames);
	const schema = fromDrizzleSchema(res.tables, res.views, config.casing);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
