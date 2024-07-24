import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type {
	AnySingleStoreQueryResultHKT,
	PreparedQueryHKTBase,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStoreQueryResultHKT,
	SingleStoreQueryResultKind,
	SingleStoreSession,
} from '~/singlestore-core/session.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SingleStoreTable } from '../table.ts';
import type { OptimizeTableArgument, SelectedColumns } from './optimizeTable.types.ts';

export type SingleStoreOptimizeTableWithout<
	T extends AnySingleStoreOptimizeTableBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SingleStoreOptimizeTableBase<
			T['_']['table'],
			T['_']['arg'],
			T['_']['queryResult'],
			T['_']['preparedQueryHKT'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SingleStoreOptimizeTable<
	TTable extends SingleStoreTable = SingleStoreTable,
	TArg extends OptimizeTableArgument = OptimizeTableArgument,
	TQueryResult extends SingleStoreQueryResultHKT = AnySingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> = SingleStoreOptimizeTableBase<TTable, TArg, TQueryResult, TPreparedQueryHKT, true, never>;

export interface SingleStoreOptimizeTableConfig {
	table: SingleStoreTable;
	arg?: OptimizeTableArgument | undefined;
	selection?: SelectedColumns | undefined;
}

export type SingleStoreOptimizeTablePrepare<T extends AnySingleStoreOptimizeTableBase> = PreparedQueryKind<
	T['_']['preparedQueryHKT'],
	SingleStorePreparedQueryConfig & {
		execute: SingleStoreQueryResultKind<T['_']['queryResult'], never>;
		iterator: never;
	},
	true
>;

type SingleStoreOptimizeTableDynamic<T extends AnySingleStoreOptimizeTableBase> = SingleStoreOptimizeTable<
	T['_']['table'],
	T['_']['arg'],
	T['_']['queryResult'],
	T['_']['preparedQueryHKT']
>;

type AnySingleStoreOptimizeTableBase = SingleStoreOptimizeTableBase<any, any, any, any, any, any>;

export interface SingleStoreOptimizeTableBase<
	TTable extends SingleStoreTable,
	TArg extends OptimizeTableArgument,
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> {
	readonly _: {
		readonly table: TTable;
		readonly arg: TArg | undefined;
		readonly queryResult: TQueryResult;
		readonly preparedQueryHKT: TPreparedQueryHKT;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
	};
}

export class SingleStoreOptimizeTableBase<
	TTable extends SingleStoreTable,
	TArg extends OptimizeTableArgument,
	TQueryResult extends SingleStoreQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<SingleStoreQueryResultKind<TQueryResult, never>> implements SQLWrapper {
	static readonly [entityKind]: string = 'SingleStoreOptimizeTable';

	private config: SingleStoreOptimizeTableConfig;

	constructor(
		private table: TTable,
		private arg: TArg | undefined,
		private session: SingleStoreSession,
		private dialect: SingleStoreDialect,
	) {
		super();
		this.config = { table, arg };
	}

	// TODO(singlestore): docs
	warmBlobCacheForColumn(...selection: SelectedColumns): SingleStoreOptimizeTableWithout<this, TDynamic, 'warmBlobCacheForColumn'> {
		if (this.config.arg) {
			throw new Error('Cannot call warmBlobCacheForColumn with an argument');
		}
		this.config.selection = selection;
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildOptimizeTable(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(): SingleStoreOptimizeTablePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			undefined,
		) as SingleStoreOptimizeTablePrepare<this>;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this.prepare().execute(placeholderValues);
	};

	private createIterator = (): ReturnType<this['prepare']>['iterator'] => {
		const self = this;
		return async function*(placeholderValues) {
			yield* self.prepare().iterator(placeholderValues);
		};
	};

	iterator = this.createIterator();

	$dynamic(): SingleStoreOptimizeTableDynamic<this> {
		return this as any;
	}
}
