import { randomUUID } from 'crypto';
import { render } from 'hanji';
import { dirname } from 'path';
import { copyDDL, type Delta } from '../../dialects/dialect';
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
import { prepareSnapshot } from '../../dialects/postgres/serializer';
import type { PostgresSnapshot } from '../../dialects/postgres/snapshot';
import { originUUID } from '../../utils';
import { prepareOutFolder } from '../../utils/utils-node';
import { isInteractive, outputFormat } from '../context';
import { CheckCliError, CommandOutputCliError } from '../errors';
import { resolver } from '../prompts';
import { Select } from '../selector-ui';
import { explain, explainJsonOutput, humanLog, postgresSchemaError, postgresSchemaWarning } from '../views';
import { checkSnapshots } from './check';
import { applyConflictFix, type ConflictFix, describeAppliedFix } from './fix-conflicts';
import { writeResult } from './generate-common';
import type { ExportConfig, GenerateConfig } from './utils';

const checkHistory = async (config: GenerateConfig<SchemaSource>, snapshots: string[]) => {
	try {
		return { checkResult: await checkSnapshots(snapshots, 'postgresql') };
	} catch (e) {
		if (!(e instanceof CheckCliError) || e.meta?.kind !== 'conflicts') throw e;
		const fix = e.meta.fix as ConflictFix;
		if (!config.fixConflicts) {
			if (!isInteractive() || config.explain) throw e;
			humanLog(e.humanMessage);
			const { data } = await render(
				new Select(['No, keep the migrations', 'Yes, delete them and generate a new migration']),
			);
			if (data?.index !== 1) {
				throw new CheckCliError(
					'conflicts',
					'The migrations are kept, and the conflicts are not fixed. To fix them later, run: drizzle-kit generate --fix-conflicts',
					e.meta,
				);
			}
		}
		const deleted = new Set(fix.migrations);
		const rest = snapshots.filter((it) => !deleted.has(dirname(it)));
		return { checkResult: await checkSnapshots(rest, 'postgresql'), fix };
	}
};

export const handle = async (config: GenerateConfig<SchemaSource>) => {
	const { out: outFolder } = config;
	const json = outputFormat() === 'json';

	const stored = prepareOutFolder(outFolder);
	const { checkResult, fix } = await checkHistory(config, stored.snapshots);
	const deleted = new Set(fix?.migrations);
	const snapshots = stored.snapshots.filter((it) => !deleted.has(dirname(it)));
	const index = stored.index.filter((it) => !deleted.has(dirname(it.path)));
	const prepared = await config.schemaSource.load();
	const { ddlCur, ddlPrev, prevIds } = await prepareSnapshot(snapshots, prepared, checkResult);
	const parentFolders = index.filter((it) => prevIds.includes(it.id)).map((it) => it.folder);

	// `state` is what the snapshot must rebuild to, and `deltas` turn `ddlPrev` into it.
	const snapshotOf = (state: PostgresDDL, deltas: Delta[]): PostgresSnapshot => {
		const header = { version: '9', dialect: 'postgres', id: randomUUID() } as const;
		if (prevIds.length === 0) return { type: 'base', ...header, prevIds: [originUUID], ddl: state.entities.list() };
		return { type: 'diff', ...header, prevIds, deltas };
	};

	// Deleting waits until generate needs no more hints, so a missing_hints response leaves the folder unchanged.
	// Explain mode is a dry run and deletes nothing.
	const withFix = <T extends object>(
		result: T,
	): T & { deleted_migrations?: string[]; deleted_custom_migrations?: string[] } => {
		if (!fix || config.explain) return result;
		applyConflictFix(fix);
		humanLog(describeAppliedFix(fix));
		return {
			...result,
			deleted_migrations: fix.migrations,
			...(fix.customMigrations.length > 0 && { deleted_custom_migrations: fix.customMigrations }),
		};
	};

	if (config.custom) {
		return withFix(writeResult({
			snapshot: snapshotOf(ddlPrev, []),
			sqlStatements: [],
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			type: 'custom',
			snapshots,
			parentFolders,
		}));
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
		return withFix(writeResult({
			snapshot: snapshotOf(ddlCur, deltas),
			sqlStatements,
			outFolder,
			name: config.name,
			breakpoints: config.breakpoints,
			dialect: 'postgresql',
			snapshots,
			parentFolders,
		}));
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
