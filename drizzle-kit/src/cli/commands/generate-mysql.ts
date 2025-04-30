import { prepareSnapshot } from 'src/dialects/mysql/serializer';
import { Column, type Table, View } from '../../dialects/mysql/ddl';
import { diffDDL } from '../../dialects/mysql/diff';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import type { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	// TODO: remove
	assertV1OutFolder(outFolder);

	const { snapshots, journal } = prepareMigrationFolder(outFolder, 'mysql');
	const { ddlCur, ddlPrev, snapshot, snapshotPrev, custom } = await prepareSnapshot(snapshots, schemaPath, casing);

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

	const { sqlStatements, statements, renames } = await diffDDL(
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
