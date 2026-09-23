import type Firebird from 'node-firebird';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { FirebirdColumn } from '~/firebird-core/columns/index.ts';
import type { FirebirdAsyncDialect } from '~/firebird-core/dialect.ts';
import { FirebirdTransaction as FirebirdCoreTransaction } from '~/firebird-core/index.ts';
import type { SelectedFieldsOrdered } from '~/firebird-core/query-builders/select.types.ts';
import type {
	FirebirdExecuteMethod,
	FirebirdTransactionConfig,
	PreparedQueryConfig as PreparedQueryConfigBase,
} from '~/firebird-core/session.ts';
import { FirebirdPreparedQuery, FirebirdSession as FirebirdCoreSession } from '~/firebird-core/session.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { mapResultRow } from '~/utils.ts';

export type NodeFirebirdClient = Firebird.Database;
export type NodeFirebirdTransactionClient = Firebird.Transaction;
export type NodeFirebirdTransactionOptions = Firebird.TransactionOptions | Firebird.Isolation;

export interface NodeFirebirdSessionOptions {
	logger?: Logger;
	cache?: Cache;
	transactionOptions?: NodeFirebirdTransactionOptions;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

type FirebirdExecutor = Pick<Firebird.Database, 'query' | 'execute'> | Pick<Firebird.Transaction, 'query' | 'execute'>;

export class NodeFirebirdSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends FirebirdCoreSession<'async', unknown[], TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeFirebirdSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NodeFirebirdClient,
		dialect: FirebirdAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeFirebirdSessionOptions,
		private tx: NodeFirebirdTransactionClient | undefined,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: FirebirdExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): NodeFirebirdPreparedQuery<T> {
		return new NodeFirebirdPreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			this.tx,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (db: NodeFirebirdTransaction<TFullSchema, TSchema>) => T | Promise<T>,
		config?: FirebirdTransactionConfig,
	): Promise<T> {
		void config;
		const firebirdTx = await startTransaction(this.client, this.options.transactionOptions);
		const session = new NodeFirebirdSession<TFullSchema, TSchema>(
			this.client,
			this.dialect,
			this.schema,
			this.options,
			firebirdTx,
		);
		const tx = new NodeFirebirdTransaction<TFullSchema, TSchema>('async', this.dialect, session, this.schema);
		try {
			const result = await transaction(tx);
			await commit(firebirdTx);
			return result;
		} catch (err) {
			await rollback(firebirdTx);
			throw err;
		}
	}

	override extractRawAllValueFromBatchResult(result: unknown): unknown {
		return result;
	}

	override extractRawGetValueFromBatchResult(result: unknown): unknown {
		return Array.isArray(result) ? result[0] : undefined;
	}

	override extractRawValuesValueFromBatchResult(result: unknown): unknown {
		return result;
	}
}

export class NodeFirebirdTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends FirebirdCoreTransaction<'async', unknown[], TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeFirebirdTransaction';

	override async transaction<T>(
		transaction: (tx: NodeFirebirdTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeFirebirdTransaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
		await this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class NodeFirebirdPreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig>
	extends FirebirdPreparedQuery<
		{ type: 'async'; run: unknown[]; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
	>
{
	static override readonly [entityKind]: string = 'NodeFirebirdPreparedQuery';

	constructor(
		private client: NodeFirebirdClient,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		/** @internal */ public fields: SelectedFieldsOrdered | undefined,
		private tx: NodeFirebirdTransactionClient | undefined,
		executeMethod: FirebirdExecuteMethod,
		private _isResponseInArrayMode: boolean,
		/** @internal */ public customResultMapper?: (
			rows: unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<unknown[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			return await executeRun(this.executor, this.query.sql, params);
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		if (!this.fields && !this.customResultMapper) {
			const rows = await this.fetchObjects(placeholderValues);
			return rows as T['all'];
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		return this.mapAllResult(rows) as T['all'];
	}

	override mapAllResult(rows: unknown): unknown {
		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][], normalizeFieldValue) as T['all'];
		}

		return (rows as unknown[][]).map((row) =>
			mapResultRow(
				this.fields!,
				row.map((value) => normalizeFieldValue(value)),
				this.joinsNotNullableMap,
			)
		);
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (!this.fields && !this.customResultMapper) {
			const rows = await this.fetchObjects(placeholderValues);
			return rows[0] as T['get'];
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		return this.mapGetResult(rows) as T['get'];
	}

	override mapGetResult(rows: unknown): unknown {
		const row = (rows as unknown[][])[0];
		if (!row) {
			return undefined;
		}

		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][], normalizeFieldValue) as T['get'];
		}

		return mapResultRow(
			this.fields!,
			row.map((value) => normalizeFieldValue(value)),
			this.joinsNotNullableMap,
		);
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		if (/\breturning\b/i.test(this.query.sql) && hasBlobReturningFields(this.fields)) {
			throw new Error(
				'node-firebird does not support BLOB columns in RETURNING. Return non-BLOB columns and select BLOB values in a follow-up query.',
			);
		}
		return await this.queryWithCache(this.query.sql, params, async () => {
			return await executeValues(this.executor, this.query.sql, params) as T['values'];
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}

	private get executor(): FirebirdExecutor {
		return this.tx ?? this.client;
	}

	private async fetchObjects(placeholderValues?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			return await queryObjects(this.executor, this.query.sql, params);
		});
	}
}

function startTransaction(
	client: NodeFirebirdClient,
	options: NodeFirebirdTransactionOptions | undefined,
): Promise<NodeFirebirdTransactionClient> {
	return new Promise((resolve, reject) => {
		if (options) {
			client.transaction(options as Firebird.TransactionOptions, (err, tx) => err ? reject(err) : resolve(tx));
		} else {
			client.transaction((err, tx) => err ? reject(err) : resolve(tx));
		}
	});
}

function commit(tx: NodeFirebirdTransactionClient): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.commit((err) => err ? reject(err) : resolve());
	});
}

function rollback(tx: NodeFirebirdTransactionClient): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.rollback((err) => err ? reject(err) : resolve());
	});
}

async function queryObjects(
	executor: FirebirdExecutor,
	query: string,
	params: unknown[],
): Promise<Record<string, unknown>[]> {
	if (isTransactionExecutor(executor)) {
		const rows = await queryObjectsRaw(executor, query, params);
		return await normalizeObjectRows(rows, executor);
	}

	const tx = await startTransaction(executor as NodeFirebirdClient, undefined);
	try {
		const rows = await queryObjectsRaw(tx, query, params);
		const result = await normalizeObjectRows(rows, tx);
		await commit(tx);
		return result;
	} catch (err) {
		await rollback(tx);
		throw err;
	}
}

async function queryObjectsRaw(
	executor: FirebirdExecutor,
	query: string,
	params: unknown[],
): Promise<Record<string, unknown>[]> {
	const rows = await new Promise<Record<string, unknown>[] | Record<string, unknown> | undefined>((resolve, reject) => {
		executor.query(query, params, (err, result) => err ? reject(err) : resolve(result as Record<string, unknown>[]));
	});
	if (Array.isArray(rows)) {
		return rows;
	}
	if (rows && typeof rows === 'object') {
		return [rows];
	}
	return [];
}

async function executeValues(executor: FirebirdExecutor, query: string, params: unknown[]): Promise<unknown[][]> {
	if (/\breturning\b/i.test(query)) {
		const rows = await queryObjects(executor, query, params);
		return rows.map((row) => Object.values(row));
	}

	if (isTransactionExecutor(executor)) {
		const rows = await executeRaw(executor, query, params);
		return await mapRowsToArrays(rows, executor);
	}

	const tx = await startTransaction(executor as NodeFirebirdClient, undefined);
	try {
		const rows = await executeRaw(tx, query, params);
		const result = await mapRowsToArrays(rows, tx);
		await commit(tx);
		return result;
	} catch (err) {
		await rollback(tx);
		throw err;
	}
}

async function executeRun(executor: FirebirdExecutor, query: string, params: unknown[]): Promise<unknown[]> {
	if (isTransactionExecutor(executor)) {
		return await executeRaw(executor, query, params) ?? [];
	}

	const tx = await startTransaction(executor as NodeFirebirdClient, undefined);
	try {
		const result = await executeRaw(tx, query, params) ?? [];
		await commit(tx);
		return result;
	} catch (err) {
		await rollback(tx);
		throw err;
	}
}

function normalizeFieldValue(value: unknown) {
	return value;
}

function executeRaw(executor: FirebirdExecutor, query: string, params: unknown[]): Promise<unknown[] | undefined> {
	return new Promise((resolve, reject) => {
		executor.execute(query, params, (err, result) => err ? reject(err) : resolve(result as unknown[] | undefined));
	});
}

function isTransactionExecutor(executor: FirebirdExecutor): executor is NodeFirebirdTransactionClient {
	return 'commit' in executor && 'rollback' in executor;
}

function hasBlobReturningFields(fields: SelectedFieldsOrdered | undefined): boolean {
	return fields?.some(({ field }) =>
		is(field, FirebirdColumn)
		&& (
			field.columnType === 'FirebirdBlobBuffer'
			|| field.columnType === 'FirebirdBlobJson'
			|| field.columnType === 'FirebirdBigInt'
		)
	) ?? false;
}

async function mapRowsToArrays(rows: unknown[] | undefined, tx: NodeFirebirdTransactionClient): Promise<unknown[][]> {
	if (!Array.isArray(rows)) {
		return [];
	}

	if (rows.length > 0 && !Array.isArray(rows[0]) && (rows[0] === null || typeof rows[0] !== 'object')) {
		return [await normalizeRow(rows, tx)];
	}

	const result: unknown[][] = [];
	for (const row of rows) {
		result.push(await normalizeRow(Array.isArray(row) ? row : Object.values(row as Record<string, unknown>), tx));
	}
	return result;
}

async function normalizeRow(row: unknown[], tx: NodeFirebirdTransactionClient): Promise<unknown[]> {
	const result: unknown[] = [];
	for (const value of row) {
		result.push(isBlobReader(value) ? await readBlob(value, tx) : value);
	}
	return result;
}

async function normalizeObjectRows(
	rows: Record<string, unknown>[],
	tx: NodeFirebirdTransactionClient | undefined,
): Promise<Record<string, unknown>[]> {
	const result: Record<string, unknown>[] = [];
	for (const row of rows) {
		const entries: [string, unknown][] = [];
		for (const [key, value] of Object.entries(row)) {
			entries.push([key, isBlobReader(value) ? await readBlob(value, tx) : value]);
		}
		result.push(Object.fromEntries(entries));
	}
	return result;
}

type NodeFirebirdBlobReader = {
	(transaction: NodeFirebirdTransactionClient, callback: NodeFirebirdBlobCallback): void;
	(callback: NodeFirebirdBlobCallback): void;
};

type NodeFirebirdBlobCallback = (
	err: Error | undefined,
	name: string | number,
	stream: NodeJS.ReadableStream,
	row: unknown,
) => void;

function isBlobReader(value: unknown): value is NodeFirebirdBlobReader {
	return typeof value === 'function';
}

function readBlob(blob: NodeFirebirdBlobReader, tx: NodeFirebirdTransactionClient | undefined): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const callback: NodeFirebirdBlobCallback = (err, _name, stream) => {
			if (err) {
				reject(err);
				return;
			}

			const chunks: Buffer[] = [];
			stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
			stream.once('end', () => resolve(Buffer.concat(chunks)));
			stream.once('error', reject);
		};

		if (tx) {
			blob(tx, callback);
		} else {
			blob(callback);
		}
	});
}
