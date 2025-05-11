import { ddlDiff } from 'src/dialects/mssql/diff';
import { prepareSnapshot } from 'src/dialects/mssql/serializer';
import { Column, MssqlEntities, Schema, View } from '../../dialects/mssql/ddl';
import { assertV1OutFolder, prepareMigrationFolder } from '../../utils-node';
import { mockResolver } from '../../utils/mocks';
import { resolver } from '../prompts';
import { writeResult } from './generate-common';
import { GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, schema: schemaPath, casing } = config;

	assertV1OutFolder(outFolder);

	const { snapshots, journal } = prepareMigrationFolder(outFolder, 'mssql');
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
	const blanks = new Set<string>();

	const { sqlStatements, renames } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema'),
		resolver<MssqlEntities['tables']>('table'),
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

// export const handleExport = async (config: ExportConfig) => {
// 	const filenames = prepareFilenames(config.schema);
// 	const res = await prepareFromSchemaFiles(filenames);
// 	const schema = fromDrizzleSchema(res, undefined);
// 	const { ddl } = interimToDDL(schema);
// 	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
// 	console.log(sqlStatements.join('\n'));
// };
