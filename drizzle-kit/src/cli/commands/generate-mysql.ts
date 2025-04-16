import {
	prepareMySqlMigrationSnapshot,
} from '../../migrationPreparator';
import { mysqlSchema, squashMysqlScheme } from '../../serializer/mysqlSchema';
import { applyMysqlSnapshotsDiff } from '../../snapshot-differ/mysql';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import type { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		// TODO: remove
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'mysql');
		const { prev, cur, custom } = await prepareMySqlMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = mysqlSchema.parse(prev);
		const validatedCur = mysqlSchema.parse(cur);

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
			});
			return;
		}

		const squashedPrev = squashMysqlScheme(validatedPrev);
		const squashedCur = squashMysqlScheme(validatedCur);

		const { sqlStatements, statements, _meta } = await applyMysqlSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			mySqlViewsResolver,
			uniqueResolver,
			validatedPrev,
			validatedCur,
		);

		writeResult({
			cur,
			sqlStatements,
			journal,
			_meta,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			prefixMode: config.prefix,
		});
	} catch (e) {
		console.error(e);
	}
};