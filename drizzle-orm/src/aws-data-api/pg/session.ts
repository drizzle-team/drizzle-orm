import type { ExecuteStatementCommandOutput, RDSDataClient } from '@aws-sdk/client-rds-data';
import {
	BeginTransactionCommand,
	CommitTransactionCommand,
	ExecuteStatementCommand,
	RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { type QueryWithTypings, sql } from '~/sql/sql.ts';
import { getValueFromDataApi, toValueParam } from '../common/index.ts';

export type AwsDataApiClient = RDSDataClient;

export interface AwsDataApiSessionOptions {
	logger?: Logger;
	cache?: Cache;
	database: string;
	resourceArn: string;
	secretArn: string;
	useJitMapper?: boolean;
}

interface AwsDataApiQueryBase {
	resourceArn: string;
	secretArn: string;
	database: string;
}

export class AwsDataApiSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<AwsDataApiPgQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'AwsDataApiSession';

	/** @internal */
	readonly rawQuery: AwsDataApiQueryBase;
	private cache: Cache;
	private logger: Logger;

	constructor(
		/** @internal */
		readonly client: AwsDataApiClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: AwsDataApiSessionOptions,
		/** @internal */
		readonly transactionId: string | undefined,
	) {
		super(dialect);
		this.rawQuery = {
			secretArn: options.secretArn,
			resourceArn: options.resourceArn,
			database: options.database,
		};
		this.cache = options.cache ?? new NoopCache();
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: QueryWithTypings,
		mode: 'arrays' | 'objects' | 'raw',
		_name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		const executor = async (params?: unknown[]) => {
			const command = new ExecuteStatementCommand({
				sql: query.sql,
				parameters: params
					? params.map((param, index) => ({
						name: `${index + 1}`,
						...toValueParam(param, query.typings?.[index]),
					}))
					: [],
				secretArn: this.options.secretArn,
				resourceArn: this.options.resourceArn,
				database: this.options.database,
				transactionId: this.transactionId,
				includeResultMetadata: mode === 'objects' || mode === 'raw',
			});

			const result = await this.client.send(command);
			const rows = result.records?.map((row) => {
				return row.map((field) => getValueFromDataApi(field));
			}) ?? [];

			if (mode === 'arrays') return rows;

			const { columnMetadata } = result;
			if (!columnMetadata) {
				return Object.assign(result, { rows });
			}

			const mappedRows = rows.map((sourceRow) => {
				const row: Record<string, unknown> = {};
				for (const [index, value] of sourceRow.entries()) {
					const metadata = columnMetadata[index];
					if (!metadata) {
						throw new Error(
							`Unexpected state: no column metadata found for index ${index}. Please report this issue on GitHub: https://github.com/drizzle-team/drizzle-orm/issues/new/choose`,
						);
					}
					if (!metadata.name) {
						throw new Error(
							`Unexpected state: no column name for index ${index} found in the column metadata. Please report this issue on GitHub: https://github.com/drizzle-team/drizzle-orm/issues/new/choose`,
						);
					}
					row[metadata.name] = value;
				}
				return row;
			});

			if (mode === 'objects') return mappedRows;
			return Object.assign(result, { rows: mappedRows });
		};

		return new PgAsyncPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override async transaction<T>(
		transaction: (tx: AwsDataApiTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const { transactionId } = await this.client.send(new BeginTransactionCommand(this.rawQuery));
		const session = new AwsDataApiSession(
			this.client,
			this.dialect,
			this.relations,
			this.options,
			transactionId,
		);
		const tx = new AwsDataApiTransaction<TRelations>(
			this.dialect,
			session,
			this.relations,
			undefined,
			true,
		);
		if (config) {
			await tx.setTransaction(config);
		}
		try {
			const result = await transaction(tx);
			await this.client.send(new CommitTransactionCommand({ ...this.rawQuery, transactionId }));
			return result;
		} catch (e) {
			await this.client.send(new RollbackTransactionCommand({ ...this.rawQuery, transactionId }));
			throw e;
		}
	}
}

export class AwsDataApiTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<AwsDataApiPgQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'AwsDataApiTransaction';

	override transaction = async <T>(
		transaction: (tx: AwsDataApiTransaction<TRelations>) => Promise<T>,
	): Promise<T> => {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new AwsDataApiTransaction<TRelations>(
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
			true,
		);
		await this.session.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await this.session.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await this.session.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw e;
		}
	};
}

export type AwsDataApiPgQueryResult<T> = ExecuteStatementCommandOutput & { rows: T[] };

export interface AwsDataApiPgQueryResultHKT extends PgQueryResultHKT {
	type: AwsDataApiPgQueryResult<this['row']>;
}
