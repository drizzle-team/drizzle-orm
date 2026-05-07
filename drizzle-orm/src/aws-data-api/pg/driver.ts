import { RDSDataClient, type RDSDataClientConfig } from '@aws-sdk/client-rds-data';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type DrizzleConfig, jitCompatCheck } from '~/utils.ts';
import { awsDataApiPgCodecs } from './codecs.ts';
import type { AwsDataApiClient, AwsDataApiPgQueryResultHKT } from './session.ts';
import { AwsDataApiSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export interface DrizzleAwsDataApiPgConfig<TRelations extends AnyRelations = EmptyRelations>
	extends DrizzlePgConfig<TRelations>
{
	database: string;
	resourceArn: string;
	secretArn: string;
}

export class AwsDataApiPgDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<AwsDataApiPgQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'AwsDataApiPgDatabase';
}

export class AwsPgDialect extends PgDialect {
	static override readonly [entityKind]: string = 'AwsPgDialect';

	override escapeParam(num: number): string {
		return `:${num + 1}`;
	}
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: AwsDataApiClient,
	config: DrizzleAwsDataApiPgConfig<TRelations>,
): AwsDataApiPgDatabase<TRelations> & {
	$client: AwsDataApiClient;
} {
	const dialect = new AwsPgDialect({
		useJitMappers: jitCompatCheck(config.jit),
		codecs: config.codecs ?? awsDataApiPgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new AwsDataApiSession(client, dialect, relations, {
		...config,
		logger,
		cache: config.cache,
	}, undefined);
	const db = new AwsDataApiPgDatabase(dialect, session, relations, true);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AwsDataApiClient = RDSDataClient,
>(
	...params: [
		(
			| (
				& DrizzlePgConfig<TRelations>
				& {
					connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
				}
			)
			| (
				& DrizzleAwsDataApiPgConfig<TRelations>
				& {
					client: TClient;
				}
			)
		),
	]
): AwsDataApiPgDatabase<TRelations> & {
	$client: TClient;
} {
	if ((params[0] as { client?: TClient }).client) {
		const { client, ...drizzleConfig } = params[0] as {
			client: TClient;
		} & DrizzleAwsDataApiPgConfig<TRelations>;

		return construct(client, drizzleConfig) as any;
	}

	const { connection, ...drizzleConfig } = params[0] as {
		connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
	} & DrizzlePgConfig<TRelations>;
	const { resourceArn, database, secretArn, ...rdsConfig } = connection;

	const instance = new RDSDataClient(rdsConfig);
	return construct(instance, { resourceArn, database, secretArn, ...drizzleConfig }) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config: DrizzleAwsDataApiPgConfig<TRelations>,
	): AwsDataApiPgDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
