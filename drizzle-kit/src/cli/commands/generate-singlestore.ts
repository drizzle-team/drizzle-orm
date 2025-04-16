import {
	prepareSingleStoreMigrationSnapshot,
} from '../../migrationPreparator';
import { singlestoreSchema, squashSingleStoreScheme } from '../../serializer/singlestoreSchema';
import { applySingleStoreSnapshotsDiff } from '../../snapshot-differ/singlestore';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import type { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const outFolder = config.out;
	const schemaPath = config.schema;
	const casing = config.casing;

	try {
		// TODO: remove
		assertV1OutFolder(outFolder);

		const { snapshots, journal } = prepareMigrationFolder(outFolder, 'singlestore');
		const { prev, cur, custom } = await prepareSingleStoreMigrationSnapshot(
			snapshots,
			schemaPath,
			casing,
		);

		const validatedPrev = singlestoreSchema.parse(prev);
		const validatedCur = singlestoreSchema.parse(cur);

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

		const squashedPrev = squashSingleStoreScheme(validatedPrev);
		const squashedCur = squashSingleStoreScheme(validatedCur);

		const { sqlStatements, _meta } = await applySingleStoreSnapshotsDiff(
			squashedPrev,
			squashedCur,
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
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
