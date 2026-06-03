import { type Config, connect, type Connection, type Statement } from '@tursodatabase/serverless';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { TursoDatabaseServerlessSession } from './session.ts';

export type TursoDatabaseServerlessRunResult = Awaited<ReturnType<Statement['run']>>;

export class TursoDatabaseServerlessDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', TursoDatabaseServerlessRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseServerlessDatabase';

	/** @internal */
	declare readonly session: TursoDatabaseServerlessSession<TRelations>;
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: Connection,
	config: DrizzleSQLiteConfig<TRelations> = {},
): TursoDatabaseServerlessDatabase<TRelations> & {
	$client: Connection;
} {
	const dialect = new SQLiteDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new TursoDatabaseServerlessSession(
		client,
		dialect,
		relations,
		{ logger, cache: config.cache },
	);
	const db = new TursoDatabaseServerlessDatabase(
		'async',
		dialect,
		session,
		relations,
	) as TursoDatabaseServerlessDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations, TClient extends Connection = Connection>(
	...params: [
		string,
	] | [
		string,
		DrizzleSQLiteConfig<TRelations>,
	] | [
		(
			& DrizzleSQLiteConfig<TRelations>
			& ({
				connection: string | Config;
			} | {
				client: TClient;
			})
		),
	]
): TursoDatabaseServerlessDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = connect({ url: params[0] });

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& { connection?: string | Config; client?: TClient }
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	const instance = typeof connection === 'string'
		? connect({ url: connection })
		: connect(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): TursoDatabaseServerlessDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
