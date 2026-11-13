import { entityKind } from '~/entity.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BasePgAsyncDatabase } from '../db.ts';
import type { DsqlAsyncSession, DsqlAsyncTransaction, DsqlTransactionConfig } from './session.ts';

export class DsqlAsyncDatabase<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends BasePgAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'DsqlAsyncDatabase';

	/** @internal */
	declare readonly session: DsqlAsyncSession<TQueryResult, TRelations>;

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: DsqlAsyncSession<TQueryResult, TRelations>;
	};

	transaction<T>(
		transaction: (tx: DsqlAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
		config?: DsqlTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}

export type DsqlAsyncWithReplicas<Q> = Q & {
	$replica: Q;
	/**
	 * @deprecated `withReplicas` db now defaults to using primary
	 *
	 * Use `db.$replica` to redirect query to replica
	 */
	$primary: Q;
	$replicas: Q[];
};

export const withReplicas = <
	HKT extends PgQueryResultHKT,
	TRelations extends AnyRelations,
	Q extends DsqlAsyncDatabase<HKT, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): DsqlAsyncWithReplicas<Q> => {
	return Object.create(primary, {
		$replica: { get: () => getReplica(replicas) },
		$primary: { value: primary },
		$replicas: { value: replicas },
	});
};
