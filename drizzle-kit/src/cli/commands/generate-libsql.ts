import { prepareSqliteMigrationSnapshot } from '../../dialects/sqlite/serializer';
import { applyLibSQLSnapshotsDiff } from '../../snapshot-differ/libsql';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import type { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'sqlite');
		const { prev, cur, custom } = await prepareSqliteMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = sqliteSchema.parse(prev);
		const validatedCur = sqliteSchema.parse(cur);

		if (config.custom) {
			writeResult({
				cur: custom,
				sqlStatements: [],
				journal,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				bundle: config.bundle,
				type: 'custom',
				prefixMode: config.prefix,
			});
			return;
		}

		const squashedPrev = squashSqliteScheme(validatedPrev, SQLiteGenerateSquasher);
		const squashedCur = squashSqliteScheme(validatedCur, SQLiteGenerateSquasher);

		const { sqlStatements, _meta } = await applyLibSQLSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			sqliteViewsResolver,
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
			bundle: config.bundle,
			prefixMode: config.prefix,
		});
	} catch (e) {
		console.error(e);
	}
};