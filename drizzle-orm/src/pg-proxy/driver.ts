import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { genericPgCodecs, type PgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type PgRemoteQueryResultHKT, PgRemoteSession } from './session.ts';

export class PgRemoteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<PgRemoteQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'PgRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
	typings?: any[],
) => Promise<{ rows: any[] }>;

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	callback: RemoteCallback,
	config: DrizzlePgConfig<TRelations> & { codecs?: PgCodecs } = {},
	_dialect: () => PgDialect = () =>
		new PgDialect({
			useJitMappers: jitCompatCheck(config.useJitMappers),
			codecs: config.codecs ?? genericPgCodecs,
		}),
): PgRemoteDatabase<TRelations> {
	const dialect = _dialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PgRemoteSession(callback, dialect, relations, { logger, cache: config.cache });
	const db = new PgRemoteDatabase(
		dialect,
		session,
		relations,
	) as PgRemoteDatabase<TRelations>;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db;
}
