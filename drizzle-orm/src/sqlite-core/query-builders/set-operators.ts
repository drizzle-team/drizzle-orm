import { entityKind, is } from '~/entity.ts';
import {
	orderSelectedFields,
	type Placeholder,
	type Query,
	SelectionProxyHandler,
	SQL,
	sql,
	type ValueOrArray,
} from '~/index.ts';
import { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { PreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { applyMixins, haveSameKeys, type PromiseOf, type ValidateShape } from '~/utils.ts';
import { type ColumnsSelection } from '~/view.ts';
import { SQLiteColumn } from '../columns/common.ts';
import type { SQLiteDialect } from '../dialect.ts';
import type { SQLiteSelectHKTBase } from './select.types.ts';

type SetOperator = 'union' | 'intersect' | 'except';

const getSQLiteSetOperators = () => {
	return {
		union,
		unionAll,
		intersect,
		except,
	};
};

type SQLiteSetOperators = ReturnType<typeof getSQLiteSetOperators>;

type SetOperatorRightSelect<
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
> = TValue extends SQLiteSetOperatorBuilder<any, any, any, any, infer TSel, infer TMode, infer TNull> ? ValidateShape<
		SelectResult<TSel, TMode, TNull>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>,
		TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
	>
	: TValue;

type SetOperatorRestSelect<
	TValue extends readonly TypedQueryBuilder<any, any[]>[],
	Valid,
> = TValue extends [infer First, ...infer Rest]
	? First extends SQLiteSetOperatorBuilder<any, any, any, any, infer TSel, infer TMode, infer TNull>
		? Rest extends TypedQueryBuilder<any, any[]>[] ? [
				ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue[0]>,
				...SetOperatorRestSelect<Rest, Valid>,
			]
		: ValidateShape<SelectResult<TSel, TMode, TNull>, Valid, TValue>
	: never[]
	: TValue;

export abstract class SQLiteSetOperatorBuilder<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends TypedQueryBuilder<
	BuildSubquerySelection<TSelection, TNullabilityMap>,
	SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
> {
	static readonly [entityKind]: string = 'SQLiteSetOperatorBuilder';

	protected abstract joinsNotNullableMap: Record<string, boolean>;
	protected abstract config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	};
	/* @internal */
	protected abstract readonly session: SQLiteSession<any, any, any, any> | undefined;
	protected abstract dialect: SQLiteDialect;

	/** @internal */
	getSetOperatorConfig() {
		return {
			session: this.session,
			dialect: this.dialect,
			joinsNotNullableMap: this.joinsNotNullableMap,
			fields: this.config.fields,
		};
	}
	union<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: SQLiteSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getSQLiteSetOperators()) : rightSelect;

		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'union',
			false,
			this,
			rightSelectOrig,
		);
	}

	unionAll<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: SQLiteSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getSQLiteSetOperators()) : rightSelect;

		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'union',
			true,
			this,
			rightSelectOrig,
		);
	}

	intersect<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: SQLiteSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getSQLiteSetOperators()) : rightSelect;

		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'intersect',
			false,
			this,
			rightSelectOrig,
		);
	}

	except<TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>>(
		rightSelect:
			| SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>
			| ((setOperator: SQLiteSetOperators) => SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>),
	): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
		const rightSelectOrig = typeof rightSelect === 'function' ? rightSelect(getSQLiteSetOperators()) : rightSelect;

		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'except',
			false,
			this,
			rightSelectOrig,
		);
	}

	abstract orderBy(builder: (aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>): this;
	abstract orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): this;

	abstract limit(limit: number): this;
}

export interface SQLiteSetOperator<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends
	TypedQueryBuilder<
		BuildSubquerySelection<TSelection, TNullabilityMap>,
		SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
	>,
	QueryPromise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>
{}

export class SQLiteSetOperator<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
> extends SQLiteSetOperatorBuilder<
	THKT,
	TTableName,
	TResultType,
	TRunResult,
	TSelection,
	TSelectMode,
	TNullabilityMap
> {
	static readonly [entityKind]: string = 'SQLiteSetOperator';

	protected joinsNotNullableMap: Record<string, boolean>;
	protected config: {
		fields: Record<string, unknown>;
		limit?: number | Placeholder;
		orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	};
	/* @internal */
	readonly session: SQLiteSession<any, any, any, any> | undefined;
	protected dialect: SQLiteDialect;

	constructor(
		private operator: SetOperator,
		private isAll: boolean,
		private leftSelect: SQLiteSetOperatorBuilder<
			THKT,
			TTableName,
			TResultType,
			TRunResult,
			TSelection,
			TSelectMode,
			TNullabilityMap
		>,
		private rightSelect: TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	) {
		super();

		const leftSelectedFields = leftSelect.getSelectedFields();
		const rightSelectedFields = rightSelect.getSelectedFields();

		if (!haveSameKeys(leftSelectedFields, rightSelectedFields)) {
			throw new Error(
				'Set operator error (union / intersect / except): selected fields are not the same or are in a different order',
			);
		}

		const { session, dialect, joinsNotNullableMap, fields } = leftSelect.getSetOperatorConfig();

		this._ = {
			selectedFields: fields as BuildSubquerySelection<TSelection, TNullabilityMap>,
		} as this['_'];

		this.session = session;
		this.dialect = dialect;
		this.joinsNotNullableMap = joinsNotNullableMap;
		this.config = {
			fields,
		};
	}

	orderBy(builder: (aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>): this;
	orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): this;
	orderBy(
		...columns:
			| [(aliases: TSelection) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): this {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.fields,
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as TSelection,
			);
			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
		} else {
			this.config.orderBy = columns as (SQLiteColumn | SQL | SQL.Aliased)[];
		}
		return this;
	}

	limit(limit: number) {
		this.config.limit = limit;
		return this;
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	override getSQL(): SQL<unknown> {
		const leftChunk = sql`${this.leftSelect.getSQL()} `;
		const rightChunk = sql`${this.rightSelect.getSQL()}`;

		let orderBySql;
		if (this.config.orderBy && this.config.orderBy.length > 0) {
			const orderByValues: SQL<unknown>[] = [];

			// The next bit is necessary because the sql operator replaces ${table.column} with `table`.`column`
			// which is invalid MySql syntax, Table from one of the SELECTs cannot be used in global ORDER clause
			for (const orderBy of this.config.orderBy) {
				if (is(orderBy, SQLiteColumn)) {
					orderByValues.push(sql.raw(orderBy.name));
				} else if (is(orderBy, SQL)) {
					for (let i = 0; i < orderBy.queryChunks.length; i++) {
						const chunk = orderBy.queryChunks[i];

						if (is(chunk, SQLiteColumn)) {
							orderBy.queryChunks[i] = sql.raw(chunk.name);
						}
					}

					orderByValues.push(sql`${orderBy}`);
				} else {
					orderByValues.push(sql`${orderBy}`);
				}
			}

			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
		}

		const limitSql = this.config.limit ? sql` limit ${this.config.limit}` : undefined;

		const operatorChunk = sql.raw(`${this.operator} ${this.isAll ? 'all ' : ''}`);

		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}`;
	}

	prepare(isOneTimeQuery?: boolean): PreparedQuery<
		{
			type: TResultType;
			run: TRunResult;
			all: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
			get: SelectResult<TSelection, TSelectMode, TNullabilityMap> | undefined;
			values: any[][];
			execute: SelectResult<TSelection, TSelectMode, TNullabilityMap>[];
		}
	> {
		if (!this.session) {
			throw new Error('Cannot execute a query on a query builder. Please use a database instance instead.');
		}
		const fieldsList = orderSelectedFields<SQLiteColumn>(this.config.fields);
		const query = this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			fieldsList,
			'all',
		);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query as ReturnType<this['prepare']>;
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare(true).run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare(true).all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare(true).get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare(true).values(placeholderValues);
	};

	async execute(): Promise<SelectResult<TSelection, TSelectMode, TNullabilityMap>[]> {
		return this.all() as PromiseOf<ReturnType<this['execute']>>;
	}
}

applyMixins(SQLiteSetOperator, [QueryPromise]);

export function union<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: SQLiteSetOperatorBuilder<
		THKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap
	>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'union',
			false,
			leftSelect,
			rightSelect,
		);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return union(
		new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'union',
			false,
			leftSelect,
			rightSelect,
		),
		select,
		...rest,
	);
}

export function unionAll<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: SQLiteSetOperatorBuilder<
		THKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap
	>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'union',
			true,
			leftSelect,
			rightSelect,
		);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return unionAll(
		new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'union',
			true,
			leftSelect,
			rightSelect,
		),
		select,
		...rest,
	);
}

export function intersect<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: SQLiteSetOperatorBuilder<
		THKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap
	>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'intersect',
			false,
			leftSelect,
			rightSelect,
		);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return intersect(
		new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'intersect',
			false,
			leftSelect,
			rightSelect!,
		),
		select,
		...rest,
	);
}

export function except<
	THKT extends SQLiteSelectHKTBase,
	TTableName extends string | undefined,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TSelection extends ColumnsSelection,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability>,
	TValue extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>,
	TRest extends TypedQueryBuilder<any, SelectResult<TSelection, TSelectMode, TNullabilityMap>[]>[],
>(
	leftSelect: SQLiteSetOperatorBuilder<
		THKT,
		TTableName,
		TResultType,
		TRunResult,
		TSelection,
		TSelectMode,
		TNullabilityMap
	>,
	rightSelect: SetOperatorRightSelect<TValue, TSelection, TSelectMode, TNullabilityMap>,
	...restSelects: SetOperatorRestSelect<TRest, SelectResult<TSelection, TSelectMode, TNullabilityMap>>
): SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap> {
	if (restSelects.length === 0) {
		return new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'except',
			false,
			leftSelect,
			rightSelect,
		);
	}

	const [select, ...rest] = restSelects;
	if (!select) throw new Error('Cannot pass undefined values to any set operator');

	return except(
		new SQLiteSetOperator<THKT, TTableName, TResultType, TRunResult, TSelection, TSelectMode, TNullabilityMap>(
			'except',
			false,
			leftSelect,
			rightSelect!,
		),
		select,
		...rest,
	);
}
