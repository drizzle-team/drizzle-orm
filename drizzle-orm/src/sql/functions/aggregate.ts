import { is, entityKind } from '~/entity.ts';
import { SQL, sql, type SQLWrapper, type SQLChunk, isSQLWrapper, type DriverValueDecoder, type GetDecoderResult } from '../sql.ts';
import { type MaybeDistinct, getValueWithDistinct } from '~/distinct.ts';
import { PgColumn } from '~/pg-core/columns/common.ts';
import { MySqlColumn } from '~/mysql-core/columns/common.ts';
import { SQLiteColumn } from '~/sqlite-core/columns/common.ts';
import type { Dialect } from '~/column-builder.ts';
import type { Column } from '~/column.ts';

export interface AggregateFunction<T = unknown> extends SQL<T> {
  mapWith<
    TDecoder extends
      | DriverValueDecoder<any, any>
      | DriverValueDecoder<any, any>['mapFromDriverValue'],
  >(decoder: TDecoder): AggregateFunction<GetDecoderResult<TDecoder>>
}
export class AggregateFunction<T = unknown> extends SQL<T> {
  static readonly [entityKind]: string = 'AggregateFunction';

  constructor(sql: SQL) {
    super(sql.queryChunks);
  }

  filterWhere(where?: SQL | undefined): this {
		if (where) {
			this.append(sql` filter (where ${where})`);
		}
		return this;
	}
}

/** @internal */
export function count$<T extends Dialect>(dialect: T, expression?: MaybeDistinct<SQLWrapper> | '*'): T extends 'pg'
  ? AggregateFunction<bigint>
  : T extends 'mysql'
    ? SQL<bigint>
    : AggregateFunction<number> 
{
  const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(isSQLWrapper(value) ? value : sql`*`);

  let fn = sql.join([sql`count(`, ...chunks, sql`)` ]);
  fn = (dialect === 'mysql' ? fn : new AggregateFunction(fn))
    .mapWith(dialect === 'sqlite' ? Number : BigInt);
  return fn as any;
}

/** @internal */
export function avg$<T extends Dialect>(dialect: T, expression: MaybeDistinct<SQLWrapper>): T extends 'mysql'
  ? SQL<string | null>
  : AggregateFunction<string | null>
{
  const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

	let fn = sql.join([sql`avg(`, ...chunks, sql`)`])
  fn = (dialect === 'mysql' ? fn : new AggregateFunction(fn)).mapWith(String);
	return fn as any;
}

/** @internal */
export function sum$<T extends Dialect>(dialect: T, expression: MaybeDistinct<SQLWrapper>): T extends 'mysql'
  ? SQL<string | null>
  : AggregateFunction<string | null>
{
  const { value, distinct } = getValueWithDistinct(expression);
	const chunks: SQLChunk[] = [];

	if (distinct) {
		chunks.push(sql`distinct `);
	}
	chunks.push(value);

  let fn = sql.join([sql`sum(`, ...chunks, sql`)`]);
  fn = (dialect === 'mysql' ? fn : new AggregateFunction(fn)).mapWith(String);
	return fn as any;
}

/** @internal */
export function max$<T1 extends Dialect, T2 extends SQLWrapper>(dialect: T1, expression: T2): T2 extends Column
  ? (T1 extends 'mysql' ? SQL<T2['_']['data'] | null> : AggregateFunction<T2['_']['data'] | null>)
  : (T1 extends 'mysql' ? SQL<string | null> : AggregateFunction<string | null>)
{
  let fn = sql.join([sql`max(`, expression, sql`)`])
  fn = (dialect === 'mysql' ? fn : new AggregateFunction(fn))
    .mapWith(is(expression, PgColumn) || is(expression, MySqlColumn) || is(expression, SQLiteColumn) ? expression : String);
  return fn as any;
}

/** @internal */
export function min$<T1 extends Dialect, T2 extends SQLWrapper>(dialect: T1, expression: T2): T2 extends Column
  ? (T1 extends 'mysql' ? SQL<T2['_']['data'] | null> : AggregateFunction<T2['_']['data'] | null>)
  : (T1 extends 'mysql' ? SQL<string | null> : AggregateFunction<string | null>)
{
  let fn = sql.join([sql`min(`, expression, sql`)`]);
  fn = (dialect === 'mysql' ? fn : new AggregateFunction(fn))
    .mapWith(is(expression, PgColumn) || is(expression, MySqlColumn) || is(expression, SQLiteColumn) ? expression : String);
  return fn as any;
}
