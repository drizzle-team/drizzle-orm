import { createPool, type PGliteLike, type Pool } from '#postgres/pglite';
import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { construct, type PostgresDatabase } from './driver-core.ts';
import type { PostgresClient } from './session.ts';

/** A PGlite instance to run on, or the options of one to create: it's data directory, or PGlite's options */
export type PostgresPgliteConnection = PGliteLike | string | (PGliteOptions & { dataDir?: string });

const isPglite = (connection: PostgresPgliteConnection): connection is PGliteLike =>
	typeof connection === 'object' && typeof (connection as PGliteLike).execProtocolRawStream === 'function';

const createInstance = (connection: Exclude<PostgresPgliteConnection, PGliteLike> | undefined) => {
	if (typeof connection !== 'object') return new PGlite(connection);

	const { dataDir, ...options } = connection;
	return new PGlite(dataDir, options);
};

/**
 * Drizzle Postgres on an in-process PGlite: the wire protocol driver of `drizzle-orm/postgres`, with named statements,
 * pipelining, `batch`, `pipeline` and the bulk writes, over a PGlite instance instead of a server
 *
 * PGlite runs one session, so the pool has one connection, which queries share through pipelining. The instance
 * stays the caller's when it is passed in as `connection`: closing the pool leaves it open.
 *
 * ```ts
 * import { drizzle } from 'drizzle-orm/postgres/pglite';
 *
 * const db = drizzle(); // in memory
 * const db = drizzle('./data'); // in a data directory
 * const db = drizzle({ connection: await PGlite.create() }); // on an instance of your own
 * const db = drizzle({ client: createPool(pg, { prepare: false }) }); // on a pool of `drizzle-orm/postgres/client/pglite`
 * ```
 */
export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = Pool,
>(
	...params:
		| []
		| [
			string,
		]
		| [
			string,
			DrizzlePgConfig<TRelations>,
		]
		| [
			& DrizzlePgConfig<TRelations>
			& ({
				client: TClient;
			} | {
				connection?: PostgresPgliteConnection;
			}),
		]
): PostgresDatabase<TRelations> & {
	$client: PostgresClient extends TClient ? Pool : TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		return construct(
			createPool(createInstance(params[0])),
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...config } = params[0] as (
		& ({ connection?: PostgresPgliteConnection; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, config) as any;

	const instance = connection !== undefined && isPglite(connection) ? connection : createInstance(connection);
	return construct(createPool(instance), config) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}

export * from '#postgres/pglite';
