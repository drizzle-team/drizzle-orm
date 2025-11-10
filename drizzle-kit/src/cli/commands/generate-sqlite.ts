import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { prepareFilenames } from 'src/utils/utils-node';
import type { Column, SqliteEntities } from '../../dialects/sqlite/ddl';
import { createDDL, interimToDDL } from '../../dialects/sqlite/ddl';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils/utils-node';
import { resolver } from '../prompts';
import { warning } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

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

		const { sqlStatements, warnings, renames } = await ddlDiff(
			ddlPrev,
			ddlCur,
			resolver<SqliteEntities['tables']>('table'),
			resolver<Column>('column'),
			'default',
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

export const handleExport = async (config: ExportConfig) => {
	const filenames = prepareFilenames(config.schema);
	const res = await prepareFromSchemaFiles(filenames);
	const schema = fromDrizzleSchema(res.tables, res.views, config.casing);
	const { ddl } = interimToDDL(schema);
	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
