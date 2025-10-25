import { Column, createDDL, interimToDDL, Table, View } from 'src/dialects/mysql/ddl';
import { ddlDiff, ddlDiffDry } from 'src/dialects/singlestore/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/singlestore/drizzle';
import { prepareSnapshot } from 'src/dialects/singlestore/serializer';
import { prepareFilenames } from 'src/utils/utils-node';
import { assertV1OutFolder, prepareMigrationFolder } from 'src/utils/utils-node';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	// TODO: remove
	assertV1OutFolder(outFolder);

	const { snapshots, journal } = prepareMigrationFolder(outFolder, 'mysql');
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, schemaPath, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			journal,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			type: 'custom',
			prefixMode: config.prefix,
			renames: [],
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
		journal,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		prefixMode: config.prefix,
		renames,
	});
};

export const handleExport = async (config: ExportConfig) => {
	const filenames = prepareFilenames(config.schema);
	const res = await prepareFromSchemaFiles(filenames);
	const schema = fromDrizzleSchema(res.tables, config.casing);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl);
	console.log(sqlStatements.join('\n'));
};
