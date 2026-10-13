import { randomUUID } from 'crypto';
import { render } from 'hanji';
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
import { createDDL } from '../../dialects/postgres/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/postgres/diff';
import { prepareFromSchemaFiles } from '../../dialects/postgres/drizzle';
import type { SchemaSource } from '../../dialects/postgres/drizzle';
import { leafFolders, readFolder, withoutMigrations } from '../../dialects/postgres/folder';
import { prepareSnapshot, stateOfSchema } from '../../dialects/postgres/serializer';
import type { PostgresSnapshot } from '../../dialects/postgres/snapshot';
import type { SnapshotStatement } from '../../dialects/postgres/snapshot-statements';
import { originUUID } from '../../utils';
import { isInteractive, outputFormat } from '../context';
import { CheckCliError, CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import { explain, explainJsonOutput, humanLog, postgresSchemaError, postgresSchemaWarning } from '../views';
import { checkSnapshots, conflictError } from './check';
import { applyConflictFix, describeAppliedFix, describeConflictFix } from './fix-conflicts';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

// Returns when an interactive user agrees to the fix. In every other case, it throws a CheckCliError of kind conflicts.
const confirmConflictFix = async (config: GenerateConfig<SchemaSource>, error: CheckCliError) => {
	if (!isInteractive() || config.explain) throw error;
	humanLog(error.humanMessage);
	const { data } = await render(
		new Select(['No, keep the migrations', 'Yes, delete them and generate a new migration']),
	);
	if (data?.index !== 1) {
		throw new CheckCliError(
			'conflicts',
			'The migrations are kept, and the conflicts are not fixed. To fix them later, run:\n'
				+ '  drizzle-kit generate --fix-conflicts',
			error.meta,
		);
	}
};

export const handle = async (config: GenerateConfig<SchemaSource>) => {
	const { out: outFolder } = config;
	const json = outputFormat() === 'json';

	const stored = readFolder(outFolder);
	const { report, fix } = await checkSnapshots(stored.files, 'postgresql');
	if (fix && !config.fixConflicts) await confirmConflictFix(config, conflictError(report, fix));
	const kept = withoutMigrations(stored, fix?.migrations ?? []);
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev } = prepareSnapshot(kept, prepared);
	const prevIds = kept.leafIds;
	const parentFolders = leafFolders(kept);

	// `state` is the state after the migration, and `deltas` turn `ddlPrev` into it. `statements` are the
	// statements of the migration, in the order of its SQL.
	const snapshotOf = (state: PostgresDDL, deltas: Delta[], statements: SnapshotStatement[]): PostgresSnapshot => {
		const header = { version: '9', dialect: 'postgres', id: randomUUID() } as const;
		if (prevIds.length === 0) {
			return { type: 'base', ...header, prevIds: [originUUID], statements, ddl: state.entities.list() };
		}
		return { type: 'diff', ...header, prevIds, statements, deltas };
	};

	// Deleting waits until generate needs no more hints, so a missing_hints response leaves the folder unchanged.
	// Explain mode is a dry run and deletes nothing.
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

	// ddlDiff changes both states. ddlCur keeps the changes: auto-named constraints get the names that the
	// SQL leaves in the database.
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
	const { stage, ddl, errors, warnings } = stateOfSchema(await prepareFromSchemaFiles(config.filenames));

	if (!ddl || errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => postgresSchemaError(it)).join('\n'), {
			stage,
			dialect: 'postgresql',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default');
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => postgresSchemaWarning(it)),
	};
};
