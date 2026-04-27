import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { xataHttpCodecs } from './codecs.ts';
import type { XataHttpClient, XataHttpQueryResultHKT } from './session.ts';
import { XataHttpSession } from './session.ts';

export class XataHttpDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<XataHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'XataHttpDatabase';

	/** @internal */
	declare readonly session: XataHttpSession<TRelations>;
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	client: XataHttpClient,
	config: DrizzlePgConfig<TRelations> = {},
): XataHttpDatabase<TRelations> & {
	$client: XataHttpClient;
} {
	const dialect = new PgDialect({
		useJitMappers: jitCompatCheck(config.useJitMappers),
		codecs: config.codecs ?? xataHttpCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new XataHttpSession(client, dialect, relations ?? {} as EmptyRelations, {
		logger,
		cache: config.cache,
	});

	const db = new XataHttpDatabase(
		dialect,
		session,
		relations,
	);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
