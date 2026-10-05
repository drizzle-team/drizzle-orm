import type { Relations } from 'drizzle-orm/_relations';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { EntitiesFilterConfig } from '../cli/validations/common';
import type { PostgresCredentials } from '../cli/validations/postgres';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresEntities,
	PostgresEntity,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../dialects/postgres/ddl';
import { fromEntities, interimToDDL } from '../dialects/postgres/ddl';
import type { PostgresSchemaState, PostgresSnapshot, PostgresSnapshotV8 } from '../dialects/postgres/snapshot';
import { upToV8 } from '../dialects/postgres/versions';
import { originUUID } from '../utils';
import type { DB } from '../utils';
import type { SnapshotNode } from '../utils/utils-node';

const schemaState = (id: string, prevIds: string[], ddl: PostgresEntity[]): PostgresSchemaState => {
	const parents = prevIds.filter((it) => it && it !== originUUID);
	return { version: '9', dialect: 'postgres', id, prevIds: parents.length === 0 ? [originUUID] : parents, ddl };
};

export const generateDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string | string[],
	schemaFilters?: string[],
): Promise<PostgresSchemaState> => {
	const { randomUUID } = await import('crypto');
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { humanLog, postgresSchemaError, postgresSchemaWarning } = await import('../cli/views');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/postgres/drizzle');
	const { extractPostgresExisting } = await import('../dialects/drizzle');
	const prepared = fromExports(imports);

	const existing = extractPostgresExisting(prepared.schemas, prepared.views, prepared.matViews);

	const filter = prepareEntityFilter('postgresql', {
		schemas: schemaFilters ?? [],
		tables: [],
		entities: undefined,
		extensions: [],
	}, existing);

	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema: interim, errors, warnings } = fromDrizzleSchema(prepared, filter);

	const { ddl, errors: err2 } = interimToDDL(interim);
	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		humanLog(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	if (err2.length > 0) {
		humanLog(err2.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return schemaState(randomUUID(), typeof prevId === 'string' ? [prevId] : prevId ?? [], ddl.entities.list());
};

// Each argument is a schema state, or a full state of an older format. Only the rows of a state are read,
// so its id and its parents do not have to match the other argument.
export const generateMigration = async (
	prev: PostgresSchemaState | Record<string, any>,
	cur: PostgresSchemaState | Record<string, any>,
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/postgres/diff');

	const { sqlStatements } = await ddlDiff(
		fromEntities(up(prev).snapshot.ddl),
		fromEntities(up(cur).snapshot.ddl),
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary_key'),
		resolver<ForeignKey>('foreign key'),
		'default',
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: PgAsyncDatabase<any>,
	entitiesConfig?: EntitiesFilterConfig,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
) => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { resolver } = await import('../cli/prompts');
	const { fromDatabaseForDrizzle } = await import('src/dialects/postgres/introspect');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/postgres/drizzle');
	const { suggestions } = await import('../cli/commands/push-postgres');
	const { extractPostgresExisting } = await import('../dialects/drizzle');
	const { ddlDiff } = await import('../dialects/postgres/diff');
	const { sql } = await import('drizzle-orm');

	const migrations = {
		schema: migrationsConfig?.schema || 'drizzle',
		table: migrationsConfig?.table || '__drizzle_migrations',
	};

	const db: DB = {
		query: async (query: string, _params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res.rows;
		},
	};
	const prepared = fromExports(imports);

	const filterConfig = entitiesConfig ?? {
		tables: [],
		schemas: [],
		extensions: [],
		entities: undefined,
	} satisfies EntitiesFilterConfig;
	const existing = extractPostgresExisting(prepared.schemas, prepared.views, prepared.matViews);
	const filter = prepareEntityFilter('postgresql', filterConfig, existing);

	const prev = await fromDatabaseForDrizzle(db, filter, () => {}, migrations);

	// TODO: filter?
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema: cur } = fromDrizzleSchema(prepared, filter);

	const { ddl: from, errors: _err1 } = interimToDDL(prev);
	const { ddl: to, errors: _err2 } = interimToDDL(cur);

	// TODO: handle errors, for now don't throw

	const { sqlStatements, statements } = await ddlDiff(
		from,
		to,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary_key'),
		resolver<ForeignKey>('foreign key'),
		'push',
	);

	const { HintsHandler } = await import('../cli/hints');
	const hints = await suggestions(db, statements, new HintsHandler());

	return {
		sqlStatements,
		hints,
		apply: async () => {
			const losses = hints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');
			for (const st of losses) {
				await db.query(st);
			}
			for (const st of sqlStatements) {
				await db.query(st);
			}
		},
	};
};

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: PostgresCredentials,
	options?: {
		host?: string;
		port?: number;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { PgTable, getTableConfig } = await import('drizzle-orm/pg-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForPostgres, prepareServer } = await import('../cli/commands/studio');
	const { humanLog: studioLog } = await import('../cli/views');

	const pgSchema: Record<string, Record<string, AnyPgTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, PgTable)) {
			const schema = getTableConfig(t).schema || 'public';
			pgSchema[schema] = pgSchema[schema] || {};
			pgSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForPostgres(credentials, pgSchema, relations, []);
	const server = await prepareServer(setup);

	const host = options?.host || '127.0.0.1';
	const port = options?.port || 4983;
	server.start({
		host,
		port,
		key: options?.key,
		cert: options?.cert,
		cb: (err) => {
			if (err) {
				console.error(err);
			} else {
				studioLog(`Studio is running at ${options?.key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};

// Converts one full state of any format to a schema state. `drizzle-kit up` converts a whole migrations folder.
export const up = (it: Record<string, any>): { snapshot: PostgresSchemaState; hints: string[] } => {
	if (it.type === 'diff') {
		throw new Error(
			`Snapshot ${it.id} is a diff snapshot, so it holds only the changes of one migration. `
				+ `Rebuild the state of ${it.id} with reconstruct first, and pass that state.`,
		);
	}
	const { snapshot, hints } = Number(it.version) >= 8
		? { snapshot: it as PostgresSchemaState | PostgresSnapshotV8, hints: [] }
		: upToV8(it);
	if (!Array.isArray(snapshot.ddl) || !Array.isArray(snapshot.prevIds)) {
		throw new Error(
			`State ${it.id} has no \`ddl\` or no \`prevIds\` array. Pass the result of generateDrizzleJson, `
				+ 'or a full state of an older format.',
		);
	}
	return { snapshot: schemaState(snapshot.id, snapshot.prevIds, snapshot.ddl), hints };
};

// `files` maps each migration folder name to the parsed JSON of its snapshot.json.
// Returns the state of snapshot `id`, or of the only leaf when `id` is not given.
export const reconstruct = async (files: Record<string, unknown>, id?: string): Promise<PostgresSchemaState> => {
	const { reconstruct: rebuild } = await import('../dialects/postgres/snapshot');
	const { assertPostgresHistory, assertSnapshotStatus, validatorForDialect } = await import('../utils/utils-node');

	// A merge replays the other branches in folder-name order.
	const folders = Object.keys(files).sort();
	const validate = validatorForDialect('postgresql');
	for (const folder of folders) {
		const raw = files[folder];
		assertSnapshotStatus(folder, typeof raw === 'object' && raw !== null ? validate(raw).status : 'malformed');
	}

	const snapshots = folders.map((folder) => files[folder] as PostgresSnapshot);
	const nodes: SnapshotNode[] = snapshots.map((it, idx) => ({
		path: folders[idx],
		folder: folders[idx],
		id: it.id,
		prevIds: it.prevIds,
		dialect: it.dialect,
		type: it.type,
	}));
	assertPostgresHistory(folders, nodes);

	if (id === undefined) {
		const parents = new Set(nodes.flatMap((it) => it.prevIds));
		const leaves = nodes.filter((it) => !parents.has(it.id));
		if (leaves.length === 0) {
			throw new Error('The migrations folder has no snapshots. Pass the snapshot files of at least one migration.');
		}
		if (leaves.length > 1) {
			throw new Error(
				`The migrations folder has ${leaves.length} leaf snapshots: ${leaves.map((it) => it.folder).join(', ')}. `
					+ 'Pass the id of the snapshot to rebuild, or run generate to merge the leaves.',
			);
		}
		id = leaves[0].id;
	}

	const history = new Map(snapshots.map((it) => [it.id, it]));
	const state = rebuild(history, id);
	return schemaState(id, history.get(id)!.prevIds, state.entities.list());
};
