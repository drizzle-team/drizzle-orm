import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { pgliteCodecs } from './codecs.ts';
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export class PgliteDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PgliteQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PgliteDatabase';
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: PgliteClient,
	config: DrizzlePgConfig<TRelations> = {},
): PgliteDatabase<TRelations> & {
	$client: PgliteClient;
} {
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? pgliteCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PgliteSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new PgliteDatabase(
		dialect,
		session,
		relations,
	) as PgliteDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	// (<any> db).$cache = { invalidate: (<any> config).cache?.onMutate };
	// if (config.cache) {
	// 	for (
	// 		const key of Object.getOwnPropertyNames(Object.getPrototypeOf(config.cache)).filter((key) =>
	// 			key !== 'constructor'
	// 		)
	// 	) {
	// 		(<any> db).$cache[key as keyof typeof config.cache] = (<any> config).cache[key];
	// 	}
	// }

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PGlite = PGlite,
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
			(
				& DrizzlePgConfig<TRelations>
				& ({
					connection?: (PGliteOptions & { dataDir?: string }) | string;
				} | {
					client: TClient;
				})
			),
		]
): PgliteDatabase<TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = new PGlite(params[0]);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as
		& {
			connection?: PGliteOptions & { dataDir: string };
			client?: TClient;
		}
		& DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig) as any;

	if (typeof connection === 'object') {
		const { dataDir, ...options } = connection;

		const instance = new PGlite(dataDir, options);

		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = new PGlite(connection);

	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PgliteDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
