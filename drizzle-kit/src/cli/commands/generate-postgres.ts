import { randomUUID } from 'crypto';
import { render } from 'hanji';
import { dirname } from 'path';
import { copyDDL, type Delta } from '../../dialects/dialect';
import { toSnapshotStatements } from '../../dialects/postgres/convertor';
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
import { prepareSnapshot, previousState, stateOfSchema } from '../../dialects/postgres/serializer';
import { assertDeltasRebuildState, type PostgresSnapshot, stateHash } from '../../dialects/postgres/snapshot';
import type { SnapshotStatement } from '../../dialects/postgres/snapshot-statements';
import { originUUID } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import { isInteractive, outputFormat } from '../context';
import { CheckCliError, CommandOutputCliError, SchemaFilesNotFoundCliError } from '../errors';
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

	const stored = prepareOutFolder(outFolder);
	const { report, fix } = await checkSnapshots(stored.snapshots, 'postgresql');
	if (fix && !config.fixConflicts) await confirmConflictFix(config, conflictError(report, fix));
	const deleted = new Set(fix?.migrations);
	const snapshots = stored.snapshots.filter((it) => !deleted.has(dirname(it)));
	const index = stored.index.filter((it) => !deleted.has(dirname(it.path)));
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev, prevIds } = await prepareSnapshot(snapshots, prepared);
	const parentFolders = index.filter((it) => prevIds.includes(it.id)).map((it) => it.folder);

	// `state` is what the snapshot must rebuild to, and `deltas` turn `ddlPrev` into it. `statements` are the
	// statements of the migration, in the order of its SQL.
	const snapshotOf = (state: PostgresDDL, deltas: Delta[], statements: SnapshotStatement[]): PostgresSnapshot => {
		const header = { version: '9', dialect: 'postgres', id: randomUUID() } as const;
		const hash = stateHash(state);
		if (prevIds.length === 0) {
			return {
				type: 'base',
				...header,
				prevIds: [originUUID],
				statements,
				ddl: state.entities.list(),
				stateHash: hash,
			};
		}
		assertDeltasRebuildState(ddlPrev, deltas, state);
		return { type: 'diff', ...header, prevIds, statements, deltas, stateHash: hash };
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
				snapshots,
				parentFolders,
			}),
			...deleteConflictingMigrations(),
		};
	}

	// ddlDiff changes both states. ddlCur keeps the changes: auto-named constraints get the names that the
	// SQL leaves in the database.
	const { sqlStatements, groupedStatements, statements, deltas } = await ddlDiff(
		copyDDL(ddlPrev),
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
				snapshot: snapshotOf(ddlCur, deltas, toSnapshotStatements(statements)),
				sqlStatements,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				dialect: 'postgresql',
				snapshots,
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

// `schema_changed` and `merge_needed` mean that generate would write SQL. `not_compared` means that check
// could not tell.
export type CheckWarning = { kind: 'schema_changed' | 'merge_needed' | 'not_compared'; message: string };

// What `check` says about a schema that differs from the migrations folder. The folder already passed the
// check, so it is valid and its branches do not conflict. The schema equals the migrations when generate
// would write no SQL. Nothing is written. No failure here may fail check, so a schema that cannot be
// compared is a warning too.
export const schemaWarnings = async (out: string, schemaSource: SchemaSource): Promise<CheckWarning[]> => {
	const notCompared = (reason: string): CheckWarning[] => [{
		kind: 'not_compared',
		message: `The schema was not compared with the migrations, because ${reason}`,
	}];
	const explain = 'Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write';
	try {
		const { ddl: ddlCur, errors } = stateOfSchema(await schemaSource.load());
		if (!ddlCur || errors.length > 0) {
			return notCompared('the schema has errors. Run drizzle-kit generate to see them.');
		}

		const stored = prepareOutFolder(out);
		const { ddlPrev, prevIds } = await previousState(stored.snapshots);
		const { sqlStatements } = await ddlDiffDry(ddlPrev, ddlCur, 'default');
		if (sqlStatements.length === 0) return [];

		const leaves = stored.index.filter((it) => prevIds.includes(it.id)).map((it) => it.folder);
		if (leaves.length === 0) {
			return [{
				kind: 'schema_changed',
				message: 'The migrations folder has no migration, and the schema is not empty. '
					+ 'Run drizzle-kit generate to write the first migration.',
			}];
		}
		if (leaves.length === 1) {
			return [{
				kind: 'schema_changed',
				message: `The schema differs from the migrations. The newest migration is ${leaves[0]}. `
					+ `${explain} a migration for it.`,
			}];
		}
		return [{
			kind: 'merge_needed',
			message: `The migrations folder has ${leaves.length} branches that are not merged: ${leaves.join(', ')}. `
				+ `The schema differs from their combined state, so a merge migration is needed. ${explain} the `
				+ 'merge migration.',
		}];
	} catch (e) {
		if (e instanceof SchemaFilesNotFoundCliError) {
			return notCompared(
				`no schema file matches ${(e.meta!.paths as string[]).join(', ')}. `
					+ 'Correct the schema path in the config file or in the --schema option.',
			);
		}
		return notCompared(
			'the comparison failed with an error. Run drizzle-kit generate to see whether it fails in the same way. '
				+ `The error: ${(e as Error).message}`,
		);
	}
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
