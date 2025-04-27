import { diffDDL } from 'src/dialects/sqlite/diff';
import { Column, SqliteEntities } from '../../dialects/sqlite/ddl';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import { resolver } from '../prompts';
import { warning } from '../views';
import { writeResult } from './generate-common';
import { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'sqlite');
		const { ddlCur, ddlPrev, snapshot, custom } = await prepareSqliteSnapshot(
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
				bundle: config.bundle,
				type: 'custom',
				prefixMode: config.prefix,
				renames: [],
			});
			return;
		}

		const { sqlStatements, warnings, renames } = await diffDDL(
			ddlCur,
			ddlPrev,
			resolver<SqliteEntities['tables']>('table'),
			resolver<Column>('column'),
			'generate',
		);

		for (const w of warnings) {
			warning(w);
		}

		writeResult({
			snapshot: snapshot,
			sqlStatements,
			journal,
			renames,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			bundle: config.bundle,
			prefixMode: config.prefix,
			driver: config.driver,
		});
	} catch (e) {
		console.error(e);
	}
};
