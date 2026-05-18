import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect, type MySqlDialectConfig } from '~/mysql-core/dialect.ts';
import type { DrizzleMySqlConfig } from '~/mysql-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type MySqlRemoteQueryResultHKT, MySqlRemoteSession } from './session.ts';

export class MySqlRemoteDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<MySqlRemoteQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'MySqlRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[]; insertId?: number; affectedRows?: number }>;

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	callback: RemoteCallback,
	config: DrizzleMySqlConfig<TRelations> = {},
	_dialect: (config?: MySqlDialectConfig) => MySqlDialect = (config) => new MySqlDialect(config),
): MySqlRemoteDatabase<TRelations> {
	const dialect = _dialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new MySqlRemoteSession(callback, dialect, relations, {
		logger,
	});
	return new MySqlRemoteDatabase(
		dialect,
		session,
		relations,
	) as MySqlRemoteDatabase<TRelations>;
}
