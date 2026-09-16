import { type AuroraClient, type AuroraConfig, createPool } from '@drizzle-team/minipg/aurora';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { minipgCodecs } from '../codecs.ts';
import type { PostgresAuroraClient, PostgresAuroraQueryResultHKT } from './session.ts';
import { PostgresAuroraSession } from './session.ts';

export class PostgresAuroraDialect extends PgDialect {
	static override readonly [entityKind]: string = 'PostgresAuroraDialect';

	override escapeParam(num: number): string {
		return `:p${num + 1}`;
	}
}

export class PostgresAuroraDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresAuroraQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresAuroraDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresAuroraClient = PostgresAuroraClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresAuroraDatabase<TRelations> & {
	$client: PostgresAuroraClient extends TClient ? AuroraClient : TClient;
} {
	// TODO: shape OR dedicated codecs
	if ((<any> client)?.temporal) (<any> client).temporal = 'string';

	const dialect = new PostgresAuroraDialect({
		codecs: config.codecs ?? minipgCodecs,
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new PostgresAuroraSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});

	const db = new PostgresAuroraDatabase(
		dialect,
		session,
		relations,
	) as PostgresAuroraDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresAuroraClient = AuroraClient,
>(
	// The Data API is addressed by cluster + secret ARN, never by a connection string, so there is no
	// string-URL overload here.
	...params: [
		& DrizzlePgConfig<TRelations>
		& ({
			client: TClient;
		} | {
			connection: AuroraConfig;
		}),
	]
): PostgresAuroraDatabase<TRelations> & {
	$client: PostgresAuroraClient extends TClient ? AuroraClient : TClient;
} {
	const { connection, client, ...config } = params[0] as (
		& ({ connection?: AuroraConfig; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, config);

	const instance = createPool({ ...connection!, temporal: 'string' });

	return construct(instance, config) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresAuroraDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
