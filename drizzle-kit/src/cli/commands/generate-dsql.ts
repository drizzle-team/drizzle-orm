import { fromDrizzleSchema, prepareFromSchemaFiles } from 'src/dialects/dsql/drizzle';
import { prepareFilenames, prepareOutFolder } from 'src/utils/utils-node';
import { ddlDiff, ddlDiffDry } from '../../dialects/dsql/diff';
import { prepareSnapshot } from '../../dialects/dsql/serializer';
import type {
	CheckConstraint,
	Column,
	Index,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { createDDL, interimToDDL } from '../../dialects/postgres/ddl';
import { resolver } from '../prompts';
import { dsqlSchemaError, dsqlSchemaWarning, explain } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

/**
 * Handles the `drizzle-kit generate` command for DSQL dialect.
 */
export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, schema: schemaPath, casing } = config;

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, schemaPath, casing);

	if (config.custom) {
		writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			type: 'custom',
			renames: [],
			snapshots,
		});
		return;
	}

	// DSQL doesn't support enums, sequences, policies, privileges, or foreign keys
	// so we use placeholder resolvers that never get called
	const { sqlStatements, renames, groupedStatements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema'),
		resolver<never>('enum'),
		resolver<never>('sequence'),
		resolver<never>('policy'),
		resolver<Role>('role'),
		resolver<never>('privilege'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary key'),
		resolver<never>('foreign key'),
		'default',
	);

	const explainMessage = explain('dsql', groupedStatements, false, []);
	if (explainMessage) console.log(explainMessage);

	writeResult({
		snapshot: snapshot,
		sqlStatements,
		outFolder,
		name: config.name,
		breakpoints: config.breakpoints,
		renames,
		snapshots,
	});
};

/**
 * Handles the `drizzle-kit export` command for DSQL dialect.
 */
export const handleExport = async (config: ExportConfig) => {
	const filenames = prepareFilenames(config.schema);
	const res = await prepareFromSchemaFiles(filenames);

	const { schema, errors, warnings } = fromDrizzleSchema(res, config.casing, () => true);

	if (warnings.length > 0) {
		console.log(warnings.map((it) => dsqlSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => dsqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		console.log(errors2.map((it) => dsqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	console.log(sqlStatements.join('\n'));
};
