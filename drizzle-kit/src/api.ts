import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'crypto';
import { is } from 'drizzle-orm';
import './@types/utils';
import { AnyPgTable, getTableConfig as pgTableConfig, PgDatabase, PgTable } from 'drizzle-orm/pg-core';
import { Relations } from 'drizzle-orm/relations';
import { pgPushIntrospect } from './cli/commands/pgIntrospect';
import { pgSuggestions } from './cli/commands/pgPushUtils';
import { updateUpToV6 as upPgV6, updateUpToV7 as upPgV7 } from './cli/commands/pgUp';
import type { CasingType } from './cli/validations/common';
import type { PostgresCredentials } from './cli/validations/postgres';
import { getTablesFilterByExtensions } from './extensions/getTablesFilterByExtensions';
import { originUUID } from './global';
import type { Config } from './index';
import {
	AllDecisions,
	ConflictNeedsResolutionError,
	createThrowingResolver,
	createThrowingResolverWithMoved,
	createThrowingTableResolver,
} from './migrationState';
import { prepareFromExports } from './serializer/pgImports';
import { PgSchema as PgSchemaKit, pgSchema, squashPgScheme } from './serializer/pgSchema';
import type { PgSchemaInternal } from './serializer/pgSchema';
import { fromDatabase as pgFromDatabase, generatePgSnapshot } from './serializer/pgSerializer';
import type { Setup } from './serializer/studio';
import type { DB } from './utils';
import { certs } from './utils/certs';
export type DrizzleSnapshotJSON = PgSchemaKit;

export const generateDrizzleJson = (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
	casing?: CasingType,
): PgSchemaKit => {
	const prepared = prepareFromExports(imports);

	const id = randomUUID();

	const snapshot = generatePgSnapshot(
		prepared.tables,
		prepared.enums,
		prepared.schemas,
		prepared.sequences,
		prepared.roles,
		prepared.policies,
		prepared.views,
		prepared.matViews,
		casing,
		schemaFilters,
	);

	return {
		...snapshot,
		id,
		prevId: prevId ?? originUUID,
	};
};

export const generateMigration = async (
	prev: DrizzleSnapshotJSON,
	cur: DrizzleSnapshotJSON,
	decisions?: AllDecisions,
	options?: { cascadeDropSchemas?: boolean },
) => {
	const { applyPgSnapshotsDiff } = await import('./snapshotsDiffer');

	const validatedPrev = pgSchema.parse(prev);
	const validatedCur = pgSchema.parse(cur);

	const squashedPrev = squashPgScheme(validatedPrev);
	const squashedCur = squashPgScheme(validatedCur);

	const { sqlStatements, _meta } = await applyPgSnapshotsDiff(
		squashedPrev,
		squashedCur,
		createThrowingResolver(decisions, 'schemas'),
		createThrowingResolverWithMoved(decisions, 'enums'),
		createThrowingResolverWithMoved(decisions, 'sequences'),
		createThrowingTableResolver(decisions, 'policies'),
		createThrowingResolver(decisions, 'indPolicies'),
		createThrowingResolver(decisions, 'roles'),
		createThrowingResolverWithMoved(decisions, 'tables'),
		createThrowingTableResolver(decisions, 'columns'),
		createThrowingResolverWithMoved(decisions, 'views'),
		validatedPrev,
		validatedCur,
		undefined,
		options?.cascadeDropSchemas,
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: PgDatabase<any>,
	schemaFilters?: string[],
	tablesFilter?: string[],
	extensionsFilters?: Config['extensionsFilters'],
) => {
	const { applyPgSnapshotsDiff } = await import('./snapshotsDiffer');
	const { sql } = await import('drizzle-orm');
	const filters = (tablesFilter ?? []).concat(
		getTablesFilterByExtensions({ extensionsFilters, dialect: 'postgresql' }),
	);

	const db: DB = {
		query: async (query: string, params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res.rows;
		},
	};

	const cur = generateDrizzleJson(imports);
	const { schema: prev } = await pgPushIntrospect(
		db,
		filters,
		schemaFilters ?? ['public'],
		undefined,
	);

	const validatedPrev = pgSchema.parse(prev);
	const validatedCur = pgSchema.parse(cur);

	const squashedPrev = squashPgScheme(validatedPrev, 'push');
	const squashedCur = squashPgScheme(validatedCur, 'push');

	const { statements } = await applyPgSnapshotsDiff(
		squashedPrev,
		squashedCur,
		createThrowingResolver(undefined, 'schemas'),
		createThrowingResolverWithMoved(undefined, 'enums'),
		createThrowingResolverWithMoved(undefined, 'sequences'),
		createThrowingTableResolver(undefined, 'policies'),
		createThrowingResolver(undefined, 'indPolicies'),
		createThrowingResolver(undefined, 'roles'),
		createThrowingResolverWithMoved(undefined, 'tables'),
		createThrowingTableResolver(undefined, 'columns'),
		createThrowingResolverWithMoved(undefined, 'views'),
		validatedPrev,
		validatedCur,
		'push',
	);

	const { shouldAskForApprove, statementsToExecute, infoToPrint } = await pgSuggestions(db, statements);

	return {
		hasDataLoss: shouldAskForApprove,
		warnings: infoToPrint,
		statementsToExecute,
		apply: async () => {
			for (const dStmnt of statementsToExecute) {
				await db.query(dStmnt);
			}
		},
	};
};

export const startStudioPostgresServer = async (
	imports: Record<string, unknown>,
	credentials: PostgresCredentials | {
		driver: 'pglite';
		client: PGlite;
	},
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
	},
) => {
	const { drizzleForPostgres } = await import('./serializer/studio');

	const pgSchema: Record<string, Record<string, AnyPgTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, PgTable)) {
			const schema = pgTableConfig(t).schema || 'public';
			pgSchema[schema] = pgSchema[schema] || {};
			pgSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForPostgres(credentials, pgSchema, relations, [], options?.casing);
	await startServerFromSetup(setup, options);
};

const startServerFromSetup = async (setup: Setup, options?: {
	host?: string;
	port?: number;
}) => {
	const { prepareServer } = await import('./serializer/studio');

	const server = await prepareServer(setup);

	const host = options?.host || '127.0.0.1';
	const port = options?.port || 4983;
	const { key, cert } = (await certs()) || {};
	server.start({
		host,
		port,
		key,
		cert,
		cb: (err) => {
			if (err) {
				console.error(err);
			} else {
				console.log(`Studio is running at ${key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};

export const upPgSnapshot = (snapshot: Record<string, unknown>) => {
	if (snapshot.version === '5') {
		return upPgV7(upPgV6(snapshot));
	}
	if (snapshot.version === '6') {
		return upPgV7(snapshot);
	}
	return snapshot;
};

export type { DB, PgSchemaInternal };

export type { AllDecisions, ColumnsResolutionDecision, ResolutionDecision } from './migrationState';

export { ConflictNeedsResolutionError } from './migrationState';

export { originUUID } from './global';

export const introspectPostgres = pgFromDatabase;

export type { Function, Trigger, Procedure } from './serializer/pgSchema';
