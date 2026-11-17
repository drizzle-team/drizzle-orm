import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { MigratorInitError } from '~/effect-core/errors.ts';
import { EffectDrizzleQueryError, EffectTransactionRollbackError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase, QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fromProgram } from '~/runtime/effect.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { pgEffectMigrationRunner } from '~/up-migrations/effect-pg.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';
import type { PgDialect } from '../dialect.ts';
import {
	PgBasePreparedQuery,
	type PgQueryResultHKT,
	PgSession,
	type PgTransactionConfig,
	type PreparedQueryConfig,
} from '../session.ts';
import { PgEffectDatabase } from './db.ts';

export class PgEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgEffectPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	constructor(
		protected executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw' | 'call',
		private logger: EffectLoggerShape,
		protected paramsInErrors: boolean | undefined,
	) {
		super(query);
		this.mapper = mapper;
	}

	override execute(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['execute']> {
		return Effect.gen({ self: this }, function*() {
			const params = fillPlaceholders(this.query.params, placeholderValues);
			const { query: { sql }, mapper, logger } = this;

			yield* logger.logQuery(sql, params);

			const query = Effect.suspend(() => this.executor(params)).pipe(
				Effect.catch((e) =>
					Effect.fail(
						new EffectDrizzleQueryError({
							query: sql,
							params: this.paramsInErrors ? params : undefined,
							cause: Cause.fail(e),
						}),
					)
				),
			);

			if (!mapper) return yield* query;

			return yield* query.pipe(Effect.map((rows) => mapper(rows as unknown[])));
		});
	}
}

export abstract class PgEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgEffectSession';

	constructor(dialect: PgDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		shape?: unknown,
	): PgEffectPreparedQuery<T, TEffectHKT>;

	override execute<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'raw',
			false,
		);

		return prepared.execute();
	}

	override arrays<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
			false,
		);

		return prepared.execute();
	}

	override objects<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
			false,
		);

		return prepared.execute();
	}

	abstract transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class PgEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgEffectDatabase<TEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'PgEffectTransaction';

	constructor(
		dialect: PgDialect,
		session: PgEffectSession<TEffectHKT, any, any>,
		protected relations: TRelations,
		protected readonly nestedIndex = 0,
		parseRqbJson?: boolean,
	) {
		super(dialect, session, relations, parseRqbJson);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigChunks(config: PgTransactionConfig): string[] {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return chunks;
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
		return sql.raw(this.getTransactionConfigChunks(config).join(' '));
	}

	/** @internal */
	setTransactionSnapshotSQL(snapshot: string): SQL {
		return sql`set transaction snapshot ${snapshot}`.inlineParams();
	}

	/** @internal */
	getTransactionConfigStatements(config: PgTransactionConfig): string[] {
		const statements: string[] = [];

		const chunks = this.getTransactionConfigChunks(config);
		if (chunks.length) statements.push(`set transaction ${chunks.join(' ')}`);

		if (typeof config.snapshot === 'string') {
			statements.push(this.dialect.sqlToQuery(this.setTransactionSnapshotSQL(config.snapshot)).sql);
		}

		return statements;
	}

	setTransaction(config: PgTransactionConfig) {
		const chunks = this.getTransactionConfigChunks(config);
		const setOptions = chunks.length
			? Effect.asVoid(this.session.execute<void>(sql.raw(`set transaction ${chunks.join(' ')}`)))
			: Effect.void;

		if (typeof config.snapshot === 'string') {
			return Effect.flatMap(
				setOptions,
				() => Effect.asVoid(this.session.execute<void>(this.setTransactionSnapshotSQL(config.snapshot!))),
			);
		}
		return setOptions;
	}

	abstract override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: PgEffectSession<TEffectHKT>,
	config: string | MigrationConfig,
) {
	// The shared Postgres migrator (`up-migrations/pg-program.ts`), run natively by Effect. What the async API
	// returns as an init failure is a typed failure here
	const initFailure = yield* fromProgram<
		void | MigratorInitFailResponse,
		TEffectHKT['error'] | SqlError,
		TEffectHKT['context']
	>(() => migrateProgram(migrations, pgEffectMigrationRunner(session), config));

	if (initFailure) return yield* new MigratorInitError({ exitCode: initFailure.exitCode });
});
