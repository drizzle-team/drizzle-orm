// @ts-ignore
import { RuleTester } from '@typescript-eslint/rule-tester';

import myRule from '../src/enforce-alias-in-subquery';

const parserResolver = require.resolve('@typescript-eslint/parser');

const ruleTester = new RuleTester({
	parser: parserResolver,
});

ruleTester.run('enforce alias in subquery (set operations)', myRule, {
	valid: [
		// every raw sql field is aliased
		`union(
			db.select({ role: sql\`'coach'\`.as('role'), id: users.id }).from(users),
			db.select({ role: sql\`'athlete'\`.as('role'), id: users.id }).from(athletes),
		)`,
		// only plain columns, no raw sql
		`union(
			db.select({ id: users.id, name: users.name }).from(users),
			db.select({ id: athletes.id, name: athletes.name }).from(athletes),
		)`,
		// raw sql in a plain select that is NOT part of a set operation
		`db.select({ label: sql\`'x'\` }).from(users)`,
		// aliased through a variable-assigned branch
		`const a = db.select({ k: sql\`'a'\`.as('k') }).from(t);
		 const b = db.select({ k: sql\`'b'\`.as('k') }).from(t);
		 const r = union(a, b);`,
		// aliased ternary arm
		`union(
			db.select({ x: cond ? t.col : sql\`NULL\`.as('x') }).from(t),
			db.select({ x: cond ? t.col : sql\`NULL\`.as('x') }).from(t),
		)`,
		// a set operation on a method (db.select().union()) with aliased fields
		`db.select({ v: sql\`1\`.as('v') }).from(t).unionAll(db.select({ v: sql\`2\`.as('v') }).from(t))`,
		// three-way union, every branch aliased
		`union(
			db.select({ role: sql\`'athlete'\`.as('role'), id: users.id }).from(a),
			db.select({ role: sql\`'coach'\`.as('role'), id: users.id }).from(b),
			db.select({ role: sql\`'self'\`.as('role'), id: users.id }).from(c),
		)`,
	],
	invalid: [
		// inline union, unaliased raw sql
		{
			code: `union(
				db.select({ role: sql\`'coach'\`, id: users.id }).from(users),
				db.select({ role: sql\`'athlete'\`.as('role'), id: users.id }).from(athletes),
			)`,
			errors: [{
				messageId: 'enforceAliasInSetOperation',
				data: { name: 'role', operation: 'union' },
				suggestions: [{
					messageId: 'addSetOperationAlias',
					data: { name: 'role' },
					output: `union(
				db.select({ role: sql\`'coach'\`.as('role'), id: users.id }).from(users),
				db.select({ role: sql\`'athlete'\`.as('role'), id: users.id }).from(athletes),
			)`,
				}],
			}],
		},
		// variable-assigned select passed to a set operation
		{
			code: `const past = db.select({ requests: sql\`count(*)\` }).from(usage);
			const today = db.select({ requests: sql\`count(*)\`.as('requests') }).from(usage);
			const all = union(past, today);`,
			errors: [{
				messageId: 'enforceAliasInSetOperation',
				data: { name: 'requests', operation: 'union' },
				suggestions: [{
					messageId: 'addSetOperationAlias',
					data: { name: 'requests' },
					output: `const past = db.select({ requests: sql\`count(*)\`.as('requests') }).from(usage);
			const today = db.select({ requests: sql\`count(*)\`.as('requests') }).from(usage);
			const all = union(past, today);`,
				}],
			}],
		},
		// unaliased raw sql arm of a ternary
		{
			code: `union(
				db.select({ athlete: notifyCoach ? rel.code : sql\`NULL\` }).from(rel),
				db.select({ athlete: notifyCoach ? rel.code : sql\`NULL\`.as('athlete') }).from(rel),
			)`,
			errors: [{
				messageId: 'enforceAliasInSetOperation',
				data: { name: 'athlete', operation: 'union' },
				suggestions: [{
					messageId: 'addSetOperationAlias',
					data: { name: 'athlete' },
					output: `union(
				db.select({ athlete: notifyCoach ? rel.code : sql\`NULL\`.as('athlete') }).from(rel),
				db.select({ athlete: notifyCoach ? rel.code : sql\`NULL\`.as('athlete') }).from(rel),
			)`,
				}],
			}],
		},
		// several unaliased fields, other set operation (except)
		{
			code: `except(
				db.select({ a: sql\`1\`, b: sql\`2\` }).from(t),
				db.select({ a: sql\`3\`.as('a'), b: sql\`4\`.as('b') }).from(t),
			)`,
			errors: [
				{
					messageId: 'enforceAliasInSetOperation',
					data: { name: 'a', operation: 'except' },
					suggestions: [{
						messageId: 'addSetOperationAlias',
						data: { name: 'a' },
						output: `except(
				db.select({ a: sql\`1\`.as('a'), b: sql\`2\` }).from(t),
				db.select({ a: sql\`3\`.as('a'), b: sql\`4\`.as('b') }).from(t),
			)`,
					}],
				},
				{
					messageId: 'enforceAliasInSetOperation',
					data: { name: 'b', operation: 'except' },
					suggestions: [{
						messageId: 'addSetOperationAlias',
						data: { name: 'b' },
						output: `except(
				db.select({ a: sql\`1\`, b: sql\`2\`.as('b') }).from(t),
				db.select({ a: sql\`3\`.as('a'), b: sql\`4\`.as('b') }).from(t),
			)`,
					}],
				},
			],
		},
		// set operation as a method call (`.intersect(...)`)
		{
			code: `db.select({ v: sql\`1\` }).from(t).intersect(db.select({ v: sql\`2\`.as('v') }).from(t))`,
			errors: [{
				messageId: 'enforceAliasInSetOperation',
				data: { name: 'v', operation: 'intersect' },
				suggestions: [{
					messageId: 'addSetOperationAlias',
					data: { name: 'v' },
					output: `db.select({ v: sql\`1\`.as('v') }).from(t).intersect(db.select({ v: sql\`2\`.as('v') }).from(t))`,
				}],
			}],
		},
		// three-way union with an unaliased raw field in a non-leading branch. drizzle only
		// throws for the trailing branches (the leading one is read raw), but every branch is
		// flagged so the union stays correct under reordering / subquery wrapping.
		{
			code: `union(
				db.select({ role: sql\`'athlete'\`.as('role') }).from(a),
				db.select({ role: sql\`'coach'\` }).from(b),
				db.select({ role: sql\`'self'\`.as('role') }).from(c),
			)`,
			errors: [{
				messageId: 'enforceAliasInSetOperation',
				data: { name: 'role', operation: 'union' },
				suggestions: [{
					messageId: 'addSetOperationAlias',
					data: { name: 'role' },
					output: `union(
				db.select({ role: sql\`'athlete'\`.as('role') }).from(a),
				db.select({ role: sql\`'coach'\`.as('role') }).from(b),
				db.select({ role: sql\`'self'\`.as('role') }).from(c),
			)`,
				}],
			}],
		},
		// variable-form branches carrying a full `.from().where().groupBy()` chain: the select
		// object is still located by walking back through the chain to the variable declaration.
		{
			code: `const past = db.select({ ts: sql\`date_trunc('day', x)\` }).from(usage).where(cond).groupBy(x);
			const today = db.select({ ts: sql\`date_trunc('hour', x)\`.as('ts') }).from(usage).where(cond).groupBy(x);
			const all = union(past, today);`,
			errors: [{
				messageId: 'enforceAliasInSetOperation',
				data: { name: 'ts', operation: 'union' },
				suggestions: [{
					messageId: 'addSetOperationAlias',
					data: { name: 'ts' },
					output:
						`const past = db.select({ ts: sql\`date_trunc('day', x)\`.as('ts') }).from(usage).where(cond).groupBy(x);
			const today = db.select({ ts: sql\`date_trunc('hour', x)\`.as('ts') }).from(usage).where(cond).groupBy(x);
			const all = union(past, today);`,
				}],
			}],
		},
	],
});

ruleTester.run('enforce alias in subquery (subqueries & CTEs)', myRule, {
	valid: [
		// unaliased raw field that is never referenced -> no runtime error
		`const sq = db.select({ foo: sql\`1\`, id: t.id }).from(t).as('sq');
		 const r = db.select({ id: sq.id }).from(sq);`,
		// the raw field is aliased
		`const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
		 const r = db.select({ foo: sq.foo }).from(sq);`,
		// only a column field of the subquery is referenced
		`const sq = db.select({ foo: sql\`1\`, id: t.id }).from(t).as('sq');
		 const r = db.select({}).from(sq).where(eq(sq.id, 1));`,
		// raw sql in a plain top-level select, never turned into a subquery
		`const r = db.select({ label: sql\`'x'\` }).from(t);`,
		// referencing a differently named field than the raw one
		`const sq = db.select({ foo: sql\`1\`, bar: t.id }).from(t).as('sq');
		 const r = db.select({ bar: sq.bar }).from(sq);`,
		// not a subquery `.as()` — a column alias
		`const c = sql\`1\`.as('c');`,
		// a read of a same-named raw field on a DIFFERENT subquery variable must not leak
		`const sub = db.select({ cnt: sql\`count(*)\` }).from(t).as('sub');
		 const other = db.select({ cnt: t.id }).from(t).as('other');
		 const r = db.select({ c: other.cnt }).from(other);`,
		// the raw field is aliased, even though it is read
		`const sub = db.select({ total: sql\`sum(t.x)\`.as('total') }).from(t).as('sub');
		 const r = db.select({ tt: sub.total }).from(sub);`,
		// select-all, but the only raw field is aliased
		`const sub = db.select({ id: t.id, total: sql\`sum(t.x)\`.as('total') }).from(t).as('sub');
		 const r = db.select().from(sub);`,
		// best-effort limitation: inline (non-variable) subquery is not tracked
		`const r = db.select().from(db.select({ x: sql\`1\` }).from(t).as('s'));`,
		// best-effort limitation: an alias reassigned to another variable is not followed
		`const a = db.select({ x: sql\`1\` }).from(t).as('s');
		 const b = a;
		 const r = db.select().from(b);`,
		// reassigned `let` — the read resolves to the second (aliased) subquery, so nothing throws
		`let sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
		 sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
		 const r = db.select({ x: sq.foo }).from(sq);`,
	],
	invalid: [
		// explicit reference as an outer select value
		{
			code: `const sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({ foo: sq.foo }).from(sq);`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({ foo: sq.foo }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// explicit reference inside a join condition
		{
			code: `const sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({ id: t.id }).from(t).leftJoin(sq, eq(sq.foo, t.id));`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({ id: t.id }).from(t).leftJoin(sq, eq(sq.foo, t.id));`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// explicit reference inside .where()
		{
			code: `const sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({}).from(sq).where(eq(sq.foo, 1));`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({}).from(sq).where(eq(sq.foo, 1));`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// CTE via db.$with(...).as(<select>), referenced field
		{
			code: `const cte = db.$with('cte').as(db.select({ n: sql\`count(*)\` }).from(t));
			const r = db.with(cte).select({ n: cte.n }).from(cte);`,
			output: `const cte = db.$with('cte').as(db.select({ n: sql\`count(*)\`.as('n') }).from(t));
			const r = db.with(cte).select({ n: cte.n }).from(cte);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'n' } }],
		},
		// CTE via arrow `(qb) => qb.select(...)`
		{
			code: `const cte = db.$with('cte').as((qb) => qb.select({ n: sql\`count(*)\` }).from(t));
			const r = db.with(cte).select({ n: cte.n }).from(cte);`,
			output: `const cte = db.$with('cte').as((qb) => qb.select({ n: sql\`count(*)\`.as('n') }).from(t));
			const r = db.with(cte).select({ n: cte.n }).from(cte);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'n' } }],
		},
		// select-all from a subquery: every unaliased raw field throws
		{
			code: `const sq = db.select({ foo: sql\`1\`, id: t.id }).from(t).as('sq');
			const r = db.select().from(sq);`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo'), id: t.id }).from(t).as('sq');
			const r = db.select().from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// two unaliased raw fields, both referenced
		{
			code: `const sq = db.select({ a: sql\`1\`, b: sql\`2\` }).from(t).as('sq');
			const r = db.select({ a: sq.a, b: sq.b }).from(sq);`,
			output: `const sq = db.select({ a: sql\`1\`.as('a'), b: sql\`2\`.as('b') }).from(t).as('sq');
			const r = db.select({ a: sq.a, b: sq.b }).from(sq);`,
			errors: [
				{ messageId: 'enforceAliasInSubquery', data: { name: 'a' } },
				{ messageId: 'enforceAliasInSubquery', data: { name: 'b' } },
			],
		},
		// referenced once, reported once even if accessed multiple times
		{
			code: `const sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({ x: sq.foo, y: sq.foo }).from(sq);`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({ x: sq.foo, y: sq.foo }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// selectDistinct source (field object in the same arg position as select)
		{
			code: `const sq = db.selectDistinct({ total: sql\`sum(1)\` }).from(t).as('sq');
			const r = db.select({ total: sq.total }).from(sq);`,
			output: `const sq = db.selectDistinct({ total: sql\`sum(1)\`.as('total') }).from(t).as('sq');
			const r = db.select({ total: sq.total }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'total' } }],
		},
		// selectDistinctOn — field object is the SECOND argument
		{
			code: `const sq = db.selectDistinctOn([t.id], { total: sql\`sum(1)\` }).from(t).as('sq');
			const r = db.select({ total: sq.total }).from(sq);`,
			output: `const sq = db.selectDistinctOn([t.id], { total: sql\`sum(1)\`.as('total') }).from(t).as('sq');
			const r = db.select({ total: sq.total }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'total' } }],
		},
		// only the unaliased field of a mixed select is reported
		{
			code: `const sq = db.select({ a: sql\`1\`.as('a'), b: sql\`2\` }).from(t).as('sq');
			const r = db.select({ a: sq.a, b: sq.b }).from(sq);`,
			output: `const sq = db.select({ a: sql\`1\`.as('a'), b: sql\`2\`.as('b') }).from(t).as('sq');
			const r = db.select({ a: sq.a, b: sq.b }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'b' } }],
		},
		// chain walks back past .groupBy(); the plain column `uid` is not flagged
		{
			code: `const sq = db.select({ total: sql\`sum(1)\`, uid: t.userId }).from(t).groupBy(t.userId).as('sq');
			const r = db.select({ total: sq.total }).from(sq);`,
			output:
				`const sq = db.select({ total: sql\`sum(1)\`.as('total'), uid: t.userId }).from(t).groupBy(t.userId).as('sq');
			const r = db.select({ total: sq.total }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'total' } }],
		},
		// an interpolated sql`` template is still an unaliased raw field
		{
			code: `const sq = db.select({ ratio: sql\`\${t.a}\` }).from(t).as('sq');
			const r = db.select({ ratio: sq.ratio }).from(sq);`,
			output: `const sq = db.select({ ratio: sql\`\${t.a}\`.as('ratio') }).from(t).as('sq');
			const r = db.select({ ratio: sq.ratio }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'ratio' } }],
		},
		// select-all reports every unaliased raw field, aliased ones excluded
		{
			code: `const sq = db.select({ foo: sql\`1\`, bar: sql\`2\`.as('bar') }).from(t).as('sq');
			const r = db.select().from(sq);`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo'), bar: sql\`2\`.as('bar') }).from(t).as('sq');
			const r = db.select().from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// computed member access with a string literal (`sq['foo']`)
		{
			code: `const sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({ x: sq['foo'] }).from(sq);`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({ x: sq['foo'] }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// read buried two levels deep inside and()/gte(); sibling column not flagged
		{
			code: `const sq = db.select({ id: t.id, foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({ id: sq.id }).from(sq).where(and(gte(sq.foo, 0), eq(sq.id, 1)));`,
			output: `const sq = db.select({ id: t.id, foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({ id: sq.id }).from(sq).where(and(gte(sq.foo, 0), eq(sq.id, 1)));`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// read hidden inside a sql`` template used as a join condition
		{
			code: `const sq = db.select({ foo: sql\`1\` }).from(t).as('sq');
			const r = db.select({ id: users.id }).from(users).innerJoin(sq, sql\`\${sq.foo} = 1\`);`,
			output: `const sq = db.select({ foo: sql\`1\`.as('foo') }).from(t).as('sq');
			const r = db.select({ id: users.id }).from(users).innerJoin(sq, sql\`\${sq.foo} = 1\`);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'foo' } }],
		},
		// variable shadowing: only the inner subquery's read is attributed to the inner declaration
		{
			code: `const sq = db.select({ o: sql\`1\` }).from(t).as('outer');
			{
			  const sq = db.select({ i: sql\`2\` }).from(t).as('inner');
			  db.select().from(sq);
			}`,
			output: `const sq = db.select({ o: sql\`1\` }).from(t).as('outer');
			{
			  const sq = db.select({ i: sql\`2\`.as('i') }).from(t).as('inner');
			  db.select().from(sq);
			}`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'i' } }],
		},
		// handle detected by shape, even with a non-literal `.as()` alias
		{
			code: `const name = 'sq';
			const sq = db.select({ v: sql\`1\` }).from(t).as(name);
			const r = db.select({ x: sq.v }).from(sq);`,
			output: `const name = 'sq';
			const sq = db.select({ v: sql\`1\`.as('v') }).from(t).as(name);
			const r = db.select({ x: sq.v }).from(sq);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'v' } }],
		},
		// the read of the inner raw field happens inside another subquery's construction
		{
			code: `const inner = db.select({ raw: sql\`1\` }).from(t).as('inner');
			const outer = db.select({ v: inner.raw }).from(inner).as('outer');`,
			output: `const inner = db.select({ raw: sql\`1\`.as('raw') }).from(t).as('inner');
			const outer = db.select({ v: inner.raw }).from(inner).as('outer');`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'raw' } }],
		},
		// CTE arrow callback with a block body (`{ return ... }`)
		{
			code: `const cte = db.$with('cte').as((qb) => { return qb.select({ n: sql\`1\` }).from(t); });
			const r = db.with(cte).select({ n: cte.n }).from(cte);`,
			output: `const cte = db.$with('cte').as((qb) => { return qb.select({ n: sql\`1\`.as('n') }).from(t); });
			const r = db.with(cte).select({ n: cte.n }).from(cte);`,
			errors: [{ messageId: 'enforceAliasInSubquery', data: { name: 'n' } }],
		},
		// dedup + unread in one snippet: a & b reported (once each), c never read
		{
			code: `const sq = db.select({ a: sql\`1\`, b: sql\`2\`, c: sql\`3\` }).from(t).as('sq');
			const r = db.select({ x: sq.a }).from(sq).where(eq(sq.b, 5));`,
			output: `const sq = db.select({ a: sql\`1\`.as('a'), b: sql\`2\`.as('b'), c: sql\`3\` }).from(t).as('sq');
			const r = db.select({ x: sq.a }).from(sq).where(eq(sq.b, 5));`,
			errors: [
				{ messageId: 'enforceAliasInSubquery', data: { name: 'a' } },
				{ messageId: 'enforceAliasInSubquery', data: { name: 'b' } },
			],
		},
	],
});
