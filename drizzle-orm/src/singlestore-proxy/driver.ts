import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type { DrizzleSingleStoreConfig } from '~/singlestore-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import {
	type SingleStoreRemotePreparedQueryHKT,
	type SingleStoreRemoteQueryResultHKT,
	SingleStoreRemoteSession,
} from './session.ts';

export class SingleStoreRemoteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SingleStoreDatabase<SingleStoreRemoteQueryResultHKT, SingleStoreRemotePreparedQueryHKT, TRelations>
{
	static override readonly [entityKind]: string = 'SingleStoreRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[]; insertId?: number; affectedRows?: number }>;

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	callback: RemoteCallback,
	config: DrizzleSingleStoreConfig<TRelations> = {},
): SingleStoreRemoteDatabase<TRelations> {
	const dialect = new SingleStoreDialect({
		useJitMappers: jitCompatCheck(config.jit),
		codecs: config.codecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new SingleStoreRemoteSession(callback, dialect, relations, {
		logger,
		cache: config.cache,
	});
	return new SingleStoreRemoteDatabase(dialect, session, relations);
}
