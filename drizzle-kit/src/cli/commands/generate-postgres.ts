import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresDDL,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../../dialects/postgres/ddl';
import { createDDL, interimToDDL } from '../../dialects/postgres/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/postgres/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/postgres/drizzle';
import type { SchemaSource } from '../../dialects/postgres/drizzle';
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import { prepareOutFolder } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, postgresSchemaError, postgresSchemaWarning } from '../views';
import type { CheckHandlerResult } from './check';
import { writeResult } from './generate-common';
import { captureRenames, cloneDDL, type ResolverFor } from './generate-down-helpers';
import type { ExportConfig, GenerateConfig } from './utils';

export const ddlDiffWithDown = async (ddlPrev: PostgresDDL, ddlCur: PostgresDDL, resolverFor: ResolverFor) => {
	const { forward, inverse } = captureRenames(resolverFor);
	const downFrom = cloneDDL(ddlCur, createDDL);
	const downTo = cloneDDL(ddlPrev, createDDL);
	const result = await ddlDiff(
		ddlPrev,
		ddlCur,
		forward<Schema>('schema'),
		forward<Enum>('enum'),
		forward<Sequence>('sequence'),
		forward<Policy>('policy'),
		forward<Role>('role'),
		forward<Privilege>('privilege'),
		forward<PostgresEntities['tables']>('table'),
		forward<Column>('column'),
		forward<View>('view'),
		forward<UniqueConstraint>('unique'),
		forward<Index>('index'),
		forward<CheckConstraint>('check'),
		forward<PrimaryKey>('primary_key'),
		forward<ForeignKey>('foreign key'),
		'default',
	);
	const down = () =>
		ddlDiff(
			downFrom,
			downTo,
			inverse<Schema>('schema'),
			inverse<Enum>('enum'),
			inverse<Sequence>('sequence'),
			inverse<Policy>('policy'),
			inverse<Role>('role'),
			inverse<Privilege>('privilege'),
			inverse<PostgresEntities['tables']>('table'),
			inverse<Column>('column'),
			inverse<View>('view'),
			inverse<UniqueConstraint>('unique'),
			inverse<Index>('index'),
			inverse<CheckConstraint>('check'),
			inverse<PrimaryKey>('primary_key'),
			inverse<ForeignKey>('foreign key'),
			'default',
		);
	return { ...result, down };
};

export const handle = async (
	config: GenerateConfig<SchemaSource>,
	checkResult?: CheckHandlerResult,
) => {
	const { out: outFolder } = config;
	const json = outputFormat() === 'json';

	const { snapshots } = prepareOutFolder(outFolder);
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev, snapshot, custom } = await prepareSnapshot(
		snapshots,
		prepared,
		checkResult,
	);

	if (config.custom) {
		return writeResult({
			snapshot: custom,
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			generateDownMigrations: config.generateDownMigrations,
			type: 'custom',
			renames: [],
			snapshots,
		});
	}

	const { sqlStatements, renames, groupedStatements, statements, down } = await ddlDiffWithDown(
		ddlPrev,
		ddlCur,
		(kind) => resolver(kind, config.hints),
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	const downDiff = config.generateDownMigrations ? await down() : undefined;
	const downSqlStatements = downDiff?.sqlStatements;

	if (!config.explain) {
		return writeResult({
			snapshot: snapshot,
			sqlStatements,
			downSqlStatements,
			downStatements: downDiff?.groupedStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			generateDownMigrations: config.generateDownMigrations,
			renames,
			snapshots,
		});
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'postgresql' };
		}
		return explainJsonOutput('postgresql', statements, []);
	}

	const explainMessage = explain('postgres', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}

	return { status: 'ok' as const, dialect: 'postgresql' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, errors, warnings } = fromDrizzleSchema(
		res,
		() => true,
	);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'postgresql',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		throw new CommandOutputCliError('export', errors2.map((it) => postgresSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'postgresql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => postgresSchemaWarning(it)),
	};
};
