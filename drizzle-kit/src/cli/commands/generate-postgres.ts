import { randomUUID } from 'crypto';
import type { Delta } from '../../dialects/dialect';
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
import { leafFolders, readFolder, withoutMigrations } from '../../dialects/postgres/folder';
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import type { PostgresSnapshot } from '../../dialects/postgres/snapshot';
import type { SnapshotStatement } from '../../dialects/postgres/snapshot-statements';
import { originUUID } from '../../utils';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { explain, explainJsonOutput, humanLog, postgresSchemaError, postgresSchemaWarning } from '../views';
import { checkSnapshots, conflictError } from './check';
import { applyConflictFix, describeAppliedFix, describeConflictFix } from './fix-conflicts';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig<SchemaSource>) => {
	const { out: outFolder } = config;
	const json = outputFormat() === 'json';

	const stored = readFolder(outFolder);
	const { report, fix } = await checkSnapshots(stored.files, 'postgresql');
	if (fix && !config.fixConflicts) throw conflictError(report, fix);
	const kept = withoutMigrations(stored, fix?.migrations ?? []);
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev, metadata } = prepareSnapshot(kept, prepared);
	const prevIds = kept.leafIds;
	const parentFolders = leafFolders(kept);

	// Builds the snapshot of the new migration. `deltas` turn `ddlPrev` into `state`, and `statements` follow
	// the order of the SQL.
	const snapshotOf = (state: PostgresDDL, deltas: Delta[], statements: SnapshotStatement[]): PostgresSnapshot => {
		const header = { version: '9', dialect: 'postgres', id: randomUUID() } as const;
		if (prevIds.length === 0) {
			return { type: 'base', ...header, prevIds: [originUUID], statements, ddl: state.entities.list() };
		}
		return { type: 'diff', ...header, prevIds, statements, deltas };
	};

	// Deletes the migrations of the conflict fix and lists them for the response. `handle` calls it after the
	// new migration is written, so a `missing_hints` response deletes nothing.
	const deleteConflictingMigrations = (): { deleted_migrations?: string[]; deleted_custom_migrations?: string[] } => {
		if (!fix || config.explain) return {};
		applyConflictFix(fix);
		humanLog(describeAppliedFix(fix));
		return {
			deleted_migrations: fix.migrations,
			...(fix.customMigrations.length > 0 && { deleted_custom_migrations: fix.customMigrations }),
		};
	};

	if (config.custom) {
		return {
			...writeResult({
				snapshot: snapshotOf(ddlPrev, [], []),
				sqlStatements: [],
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				dialect: 'postgresql',
				type: 'custom',
				snapshots: [],
				parentFolders,
			}),
			...deleteConflictingMigrations(),
		};
	}

	// `ddlDiff` changes `ddlPrev` and `ddlCur`. `snapshotOf` stores the changed `ddlCur`, because its auto-named
	// constraints then have the names that the SQL leaves in the database.
	const { sqlStatements, groupedStatements, statements, snapshotStatements, deltas } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', config.hints),
		resolver<Enum>('enum', config.hints),
		resolver<Sequence>('sequence', config.hints),
		resolver<Policy>('policy', config.hints),
		resolver<Role>('role', config.hints),
		resolver<PostgresEntities['tables']>('table', config.hints),
		resolver<Column>('column', config.hints),
		resolver<View>('view', config.hints),
		resolver<UniqueConstraint>('unique', config.hints),
		resolver<Index>('index', config.hints),
		resolver<CheckConstraint>('check', config.hints),
		resolver<PrimaryKey>('primary_key', config.hints),
		resolver<ForeignKey>('foreign key', config.hints),
		'default',
		metadata,
	);

	if (config.hints.hasMissingHints()) {
		return config.hints.toResponse();
	}

	if (!config.explain) {
		return {
			...writeResult({
				snapshot: snapshotOf(ddlCur, deltas, snapshotStatements),
				sqlStatements,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				dialect: 'postgresql',
				snapshots: [],
				parentFolders,
			}),
			...deleteConflictingMigrations(),
		};
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'postgresql', ...(fix && { fix }) };
		}
		return { ...explainJsonOutput('postgresql', statements, []), ...(fix && { fix }) };
	}

	const explainMessage = explain('postgres', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
	if (fix) humanLog(describeConflictFix(fix, sqlStatements.length > 0));

	return { status: 'ok' as const, dialect: 'postgresql' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema, metadata, errors, warnings } = fromDrizzleSchema(
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

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default', metadata);
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => postgresSchemaWarning(it)),
	};
};
