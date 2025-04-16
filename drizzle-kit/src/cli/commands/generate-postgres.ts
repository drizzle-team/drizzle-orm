import { Column, Enum, Policy, PostgresEntities, Role, Schema, Sequence, View } from '../../dialects/postgres/ddl';
import { ddlDif } from '../../dialects/postgres/diff';
import { preparePostgresMigrationSnapshot } from '../../dialects/postgres/serializer';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import { mockResolver } from '../../utils/mocks';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, schema: schemaPath, casing } = config;

	try {
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'postgresql');
		const { ddlCur, ddlPrev, snapshot, custom } = await preparePostgresMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				type: 'custom',
				prefixMode: config.prefix,
				_meta: null,
			});
			return;
		}
		const blanks = new Set<string>();

		const { sqlStatements, _meta } = await ddlDif(
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
			mockResolver(blanks), // uniques
			mockResolver(blanks), // indexes
			mockResolver(blanks), // checks
			mockResolver(blanks), // pks
			mockResolver(blanks), // fks
			'default',
		);

		writeResult({
			cur: snapshot,
			sqlStatements,
			journal,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			prefixMode: config.prefix,
			_meta: _meta ?? null,
		});
	} catch (e) {
		console.error(e);
	}
};
