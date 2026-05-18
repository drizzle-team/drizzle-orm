import type { Config } from '@planetscale/database';
import { Client } from '@planetscale/database';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { DrizzleMySqlConfig } from '~/mysql-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import type { PlanetscaleQueryResultHKT } from './session.ts';
import { PlanetscaleSession } from './session.ts';

export class PlanetScaleDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<PlanetscaleQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PlanetScaleDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Client = Client,
>(
	client: TClient,
	config: DrizzleMySqlConfig<TRelations> = {},
): PlanetScaleDatabase<TRelations> & {
	$client: TClient;
} {
	// Client is not Drizzle Object, so we can ignore this rule here
	// oxlint-disable-next-line drizzle-internal/no-instanceof
	if (!(client instanceof Client)) {
		throw new Error(`Warning: You need to pass an instance of Client:

import { Client } from "@planetscale/database";

const client = new Client({
  host: process.env["DATABASE_HOST"],
  username: process.env["DATABASE_USERNAME"],
  password: process.env["DATABASE_PASSWORD"],
});

const db = drizzle({ client });
		`);
	}

	const dialect = new MySqlDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PlanetscaleSession(client, dialect, undefined, relations, {
		logger,
		cache: config.cache,
	});
	const db = new PlanetScaleDatabase(
		dialect,
		session,
		relations,
	) as PlanetScaleDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Client = Client,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleMySqlConfig<TRelations>,
	] | [
		(
			& DrizzleMySqlConfig<TRelations>
			& ({
				connection: string | Config;
			} | {
				client: TClient;
			})
		),
	]
): PlanetScaleDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Client({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleMySqlConfig } = params[0] as
		& { connection?: Config | string; client?: TClient }
		& DrizzleMySqlConfig<TRelations>;

	if (client) return construct(client, DrizzleMySqlConfig) as any;

	const instance = typeof connection === 'string'
		? new Client({
			url: connection,
		})
		: new Client(
			connection!,
		);

	return construct(instance, DrizzleMySqlConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleMySqlConfig<TRelations>,
	): PlanetScaleDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
