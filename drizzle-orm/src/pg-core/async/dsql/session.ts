import { entityKind } from '~/entity.ts';
import { DrizzleError, TransactionRollbackError } from '~/errors.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BasePgAsyncSession } from '../session.ts';
import { DsqlAsyncDatabase } from './db.ts';

/**
 * Retries of a whole transaction on optimistic concurrency conflicts (`OC000`, `OC001`, `40001`)
 *
 * Delays grow exponentially from `baseDelayMs` up to `maxDelayMs`, each one extended by up to `jitterFactor` of itself.
 */
export interface DsqlOccConfig {
	maxRetries?: number | undefined;
	baseDelayMs?: number | undefined;
	maxDelayMs?: number | undefined;
	jitterFactor?: number | undefined;
}

export interface DsqlTransactionConfig {
	/**
	 * Re-run the transaction when it fails on an optimistic concurrency conflict:
	 * - `true` - retry with the driver's defaults
	 * - {@link DsqlOccConfig} - retry overriding driver's config's values
	 * - `false` or `undefined` - don't retry
	 *
	 * The callback may be invoked several times, so it must be idempotent: no side effects outside the transaction that must not repeat.
	 */
	occ?: boolean | DsqlOccConfig | undefined;
}

const occErrorCodes = new Set(['OC000', 'OC001', '40001']);

function getOccCode(error: unknown): string | undefined {
	for (let e: any = error, depth = 0; e && typeof e === 'object' && depth < 8; e = e.cause, ++depth) {
		if (typeof e.code === 'string' && occErrorCodes.has(e.code)) return e.code;
	}

	return undefined;
}

export function surfaceDsqlOccCode(error: unknown): never {
	if (error && typeof error === 'object' && !('code' in error)) {
		const code = getOccCode(error);
		if (code !== undefined) (error as { code?: string }).code = code;
	}

	throw error;
}

export abstract class DsqlAsyncSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends BasePgAsyncSession {
	static override readonly [entityKind]: string = 'DsqlAsyncSession';

	abstract transaction<T>(
		transaction: (tx: DsqlAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
		config?: DsqlTransactionConfig,
	): Promise<T>;
}

export abstract class DsqlAsyncTransaction<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends DsqlAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'DsqlAsyncTransaction';

	constructor(
		dialect: PgDialect,
		session: DsqlAsyncSession<any, any>,
		relations: TRelations,
		parseRqbJson: boolean | undefined,
	) {
		super(dialect, session, relations, parseRqbJson);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Aurora DSQL has no savepoints, so a transaction can't be nested inside another one */
	override async transaction<T>(
		_transaction: (tx: DsqlAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
	): Promise<T> {
		throw new DrizzleError({
			message: 'Aurora DSQL does not support nested transactions: savepoints are unavailable',
		});
	}
}
