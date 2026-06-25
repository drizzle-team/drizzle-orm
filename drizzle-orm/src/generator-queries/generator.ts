import { entityKind } from '~/entity.ts';
import { type SQL, sql } from '~/sql/sql.ts';

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I
	: never;

export type LastOf<U> = UnionToIntersection<U extends any ? (f: U) => void : never> extends ((f: infer L) => void) ? L
	: never;

export type UnionToTuple<U, L = LastOf<U>> = [U] extends [never] ? [] : [...UnionToTuple<Exclude<U, L>>, L];

export class YieldableQuery<TRes = unknown> {
	static readonly [entityKind]: string = 'YieldableQuery';
	declare readonly $brand: 'YieldableQuery';

	constructor(
		readonly sql: SQL,
		readonly noResponse: boolean,
		/** For drivers that can only query in array mode */
		readonly arrayToObjectShape?: string[],
	) {}

	*[Symbol.iterator](): Generator<YieldableQuery<TRes>, TRes> {
		return (yield this) as TRes;
	}

	reshape(arrayInput: unknown[]): TRes {
		const { arrayToObjectShape } = this;
		if (!arrayToObjectShape) {
			throw new Error("Can't use `reshape` without `arrayToObjectShape` mapping instructions"!);
		}

		if (arrayInput.length !== arrayToObjectShape.length) {
			throw new Error(
				`Unable to parse array [ ${arrayInput.join(', ')} ] to shape { ${
					arrayToObjectShape.join(', ')
				} } because of item number mismatch`,
			);
		}

		return Object.fromEntries(arrayInput.map((v, i) => [arrayToObjectShape[i], v]));
	}

	static withResult<TRes extends Record<string, unknown> = Record<string, unknown>>(
		query: SQL,
		arrayToObjectShape?: UnionToTuple<keyof TRes>,
	): YieldableQuery<TRes[]> {
		return new YieldableQuery(query, false, arrayToObjectShape as string[] | undefined);
	}

	static silent(
		query: SQL,
	): YieldableQuery<void> {
		return new YieldableQuery<void>(query, true);
	}

	static batch(queries: (SQL)[]): YieldableQueryBatch {
		return new YieldableQueryBatch(queries);
	}
}

export class YieldableQueryBatch {
	static readonly [entityKind]: string = 'YieldableQueryBatch';
	declare readonly $brand: 'YieldableQueryBatch';

	constructor(
		readonly queries: (SQL)[],
	) {}

	*[Symbol.iterator](): Generator<YieldableQueryBatch, void> {
		return (yield this) as void;
	}
}

export type QueryGenerator<TRes = unknown> = Generator<
	YieldableQuery | YieldableQueryBatch | QueryGenerator,
	TRes,
	any
>;

export function* yielder() {
	yield* YieldableQuery.silent(sql`drop table if exists users;`);
	yield* YieldableQuery.silent(sql`drop table if exists posts;`);

	yield* YieldableQuery.silent(sql`create table users (id integer primary key, name text);`);
	yield* YieldableQuery.silent(sql`create table posts (id integer primary key, content text, author_id integer);`);

	yield* YieldableQuery.silent(sql`insert into users(id, name) values (1, 'First');`);
	yield* YieldableQuery.silent(sql`insert into posts(id, author_id, content) values (1, 1, 'First''s post');`);

	const users = yield* YieldableQuery.withResult<{ id: number; name: string }>(
		sql`select id, name from users limit 1;`,
	);

	const posts = yield* YieldableQuery.withResult<{ post_id: number; content: string }>(
		sql`select id as post_id, content from posts where posts.author_id = ${users[0]!.id} limit 1;`,
	);

	yield* YieldableQuery.batch([sql``, sql``]);

	return posts[0]!;
}
