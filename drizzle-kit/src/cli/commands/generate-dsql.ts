import { ddlDiff, ddlDiffDry } from '../../dialects/dsql/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/dsql/drizzle';
import { prepareSnapshot } from '../../dialects/dsql/serializer';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { createDDL, interimToDDL } from '../../dialects/postgres/ddl';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { dsqlSchemaError, dsqlSchemaWarning, explain, explainJsonOutput, humanLog } from '../views';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

/**
 * Handles the `drizzle-kit generate` command for DSQL dialect.
 */
export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames } = config;
	const json = outputFormat() === 'json';

	const { snapshots } = prepareOutFolder(outFolder);
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(snapshots, filenames);

	if (config.custom) {
		return writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'dsql',
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	// DSQL doesn't support enums, policies, or privileges
	// so we use placeholder resolvers that never get called
	const { sqlStatements, renames, groupedStatements, statements } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', config.hints),
		resolver<never>('enum', config.hints),
		resolver<Sequence>('sequence', config.hints),
		resolver<never>('policy', config.hints),
		resolver<Role>('role', config.hints),
		resolver<never>('privilege', config.hints),
		resolver<PostgresEntities['tables']>('table', config.hints),
		resolver<Column>('column', config.hints),
		resolver<View>('view', config.hints),
		resolver<UniqueConstraint>('unique', config.hints),
		resolver<Index>('index', config.hints),
		resolver<CheckConstraint>('check', config.hints),
		resolver<PrimaryKey>('primary_key', config.hints),
		resolver<ForeignKey>('foreign key', config.hints),
		'default',
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	if (!config.explain) {
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'dsql',
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'dsql' };
		}
		return explainJsonOutput('dsql', statements, []);
	}

	const explainMessage = explain('dsql', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'dsql' };
};

/**
 * Handles the `drizzle-kit export` command for DSQL dialect.
 */
export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);

	const { schema, errors, warnings } = fromDrizzleSchema(res, () => true);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => dsqlSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'dsql',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		throw new CommandOutputCliError('export', errors2.map((it) => dsqlSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'dsql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => dsqlSchemaWarning(it)),
	};
};
