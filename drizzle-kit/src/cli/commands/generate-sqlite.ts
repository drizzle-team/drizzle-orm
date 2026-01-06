import { ddlDiff, ddlDiffDry } from 'src/dialects/sqlite/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/sqlite/drizzle';
import { prepareFilenames, prepareOutFolder } from 'src/utils/utils-node';
import { type Column, createDDL, interimToDDL, type SqliteEntities } from '../../dialects/sqlite/ddl';
import { prepareSqliteSnapshot } from '../../dialects/sqlite/serializer';
import { resolver } from '../prompts';
import { warning } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		const { snapshots } = prepareOutFolder(outFolder);
		const { ddlCur, ddlPrev, snapshot, custom } = await prepareSqliteSnapshot(
			snapshots,
			schemaPath,
			casing,
		);
		if (config.custom) {
			writeResult({
				snapshot: custom,
				sqlStatements: [],
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				bundle: config.bundle,
				type: 'custom',
				renames: [],
				snapshots,
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
			renames,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			bundle: config.bundle,
			driver: config.driver,
			snapshots,
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
