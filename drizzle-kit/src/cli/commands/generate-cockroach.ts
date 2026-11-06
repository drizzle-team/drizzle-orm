import { randomUUID } from 'crypto';
import { footprintsOf } from '../../dialects/cockroach/commutativity';
import type {
	CheckConstraint,
	CockroachDDL,
	CockroachEntities,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PrimaryKey,
	Schema,
	Sequence,
	View,
} from '../../dialects/cockroach/ddl';
import { createDDL, interimToDDL } from '../../dialects/cockroach/ddl';
import { ddlDiff, ddlDiffDry } from '../../dialects/cockroach/diff';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../dialects/cockroach/drizzle';
import { leafFolders, readFolder, withoutMigrations } from '../../dialects/cockroach/folder';
import { prepareSnapshot } from '../../dialects/cockroach/serializer';
import type { CockroachSnapshot } from '../../dialects/cockroach/snapshot';
import type { Delta } from '../../dialects/dialect';
import { originUUID } from '../../utils';
import { outputFormat } from '../context';
import { CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { cockroachSchemaError, cockroachSchemaWarning, explain, explainJsonOutput, humanLog } from '../views';
import { checkSnapshots, conflictError } from './check';
import { applyConflictFix, describeAppliedFix, describeConflictFix } from './fix-conflicts';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

export const handle = async (config: GenerateConfig) => {
	const { out: outFolder, filenames } = config;
	const json = outputFormat() === 'json';

	const stored = readFolder(outFolder);
	const { report, fix } = await checkSnapshots(stored.files, 'cockroach');
	if (fix && !config.fixConflicts) throw conflictError(report, fix);
	const kept = withoutMigrations(stored, fix?.migrations ?? []);
	const { ddlCur, ddlPrev, metadata } = await prepareSnapshot(kept, filenames);
	const prevIds = kept.leafIds;
	const parentFolders = leafFolders(kept);

	// Builds the snapshot of the new migration. `deltas` turn the combined state of the leaves into `state`, and
	// `footprints` follow the order of the SQL.
	const snapshotOf = (state: CockroachDDL, deltas: Delta[], footprints: ReturnType<typeof footprintsOf>) => {
		const header = { version: '2', dialect: 'cockroach', id: randomUUID() } as const;
		if (prevIds.length === 0) {
			return {
				type: 'base',
				...header,
				prevIds: [originUUID],
				footprints,
				ddl: state.entities.list(),
			} satisfies CockroachSnapshot;
		}
		return { type: 'diff', ...header, prevIds, footprints, deltas } satisfies CockroachSnapshot;
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
				dialect: 'cockroach',
				type: 'custom',
				snapshots: [],
				parentFolders,
			}),
			...deleteConflictingMigrations(),
		};
	}

	const { sqlStatements, groupedStatements, statements, deltas } = await ddlDiff(
		ddlPrev,
		ddlCur,
		resolver<Schema>('schema', config.hints),
		resolver<Enum>('enum', config.hints),
		resolver<Sequence>('sequence', config.hints),
		resolver<Policy>('policy', config.hints),
		resolver<CockroachEntities['tables']>('table', config.hints),
		resolver<Column>('column', config.hints),
		resolver<View>('view', config.hints),
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
				snapshot: snapshotOf(ddlCur, deltas, footprintsOf(groupedStatements)),
				sqlStatements,
				outFolder,
				name: config.name,
				breakpoints: config.breakpoints,
				dialect: 'cockroach',
				snapshots: [],
				parentFolders,
			}),
			...deleteConflictingMigrations(),
		};
	}

	if (json) {
		if (sqlStatements.length === 0) {
			return { status: 'no_changes' as const, dialect: 'cockroach', ...(fix && { fix }) };
		}
		return { ...explainJsonOutput('cockroach', statements, []), ...(fix && { fix }) };
	}

	const explainMessage = explain('cockroach', groupedStatements, []);
	if (explainMessage) {
		humanLog(explainMessage);
	}
	if (fix) humanLog(describeConflictFix(fix, sqlStatements.length > 0));

	return { status: 'ok' as const, dialect: 'cockroach' };
};

export const handleExport = async (config: ExportConfig) => {
	const res = await prepareFromSchemaFiles(config.filenames);

	// TODO: do we wanna respect entity filter while exporting to sql?
	// cc: @AleksandrSherman
	const { schema, metadata, errors, warnings } = fromDrizzleSchema(res, () => true);

	if (errors.length > 0) {
		throw new CommandOutputCliError('export', errors.map((it) => cockroachSchemaError(it)).join('\n'), {
			stage: 'schema',
			dialect: 'cockroach',
		});
	}

	const { ddl, errors: errors2 } = interimToDDL(schema);

	if (errors2.length > 0) {
		throw new CommandOutputCliError('export', errors2.map((it) => cockroachSchemaError(it)).join('\n'), {
			stage: 'ddl',
			dialect: 'cockroach',
		});
	}

	const { sqlStatements } = await ddlDiffDry(createDDL(), ddl, 'default', metadata);
	return {
		statements: sqlStatements,
		warnings: warnings.map((it) => cockroachSchemaWarning(it)),
	};
};
