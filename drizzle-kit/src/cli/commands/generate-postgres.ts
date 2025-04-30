import { Column, Enum, Policy, PostgresEntities, Role, Schema, Sequence, View } from '../../dialects/postgres/ddl';
import { ddlDiff } from '../../dialects/postgres/diff';
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import { mockResolver } from '../../utils/mocks';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, schema: schemaPath, casing } = config;

	assertV1OutFolder(outFolder);

	const { snapshots, journal } = prepareMigrationFolder(outFolder, 'postgresql');
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(
		snapshots,
		schemaPath,
		casing,
	);

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
	const blanks = new Set<string>();

	const { sqlStatements, renames } = await ddlDiff(
		ddlCur,
		ddlPrev,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		// TODO: handle all renames
		mockResolver(blanks), // uniques
		mockResolver(blanks), // indexes
		mockResolver(blanks), // checks
		mockResolver(blanks), // pks
		mockResolver(blanks), // fks
		'default',
	);

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		journal,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		prefixMode: config.prefix,
		renames,
	});
};
