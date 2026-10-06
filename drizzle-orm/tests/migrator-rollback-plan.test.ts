import { describe, expect, test } from 'vitest';
import { DrizzleError } from '~/errors';
import type { MigrationMeta } from '~/migrator';
import { type JournalRow, planRollback } from '~/migrator.utils';

function local(name: string, downSql?: string[], hash = `hash_${name}`): MigrationMeta {
	return { name, hash, downSql, sql: [`-- up ${name}`], bps: true, folderMillis: Number(name.slice(0, 14)) };
}

function row(id: number, name: string | null, hash = `hash_${name}`, created_at?: number): JournalRow {
	return { id, name, hash, created_at: created_at ?? null };
}

const a = local('20240101000000_a', ['DROP TABLE a']);
const b = local('20240102000000_b', ['DROP TABLE b']);
const c = local('20240103000000_c', ['DROP TABLE c']);
const applied = [row(1, a.name), row(2, b.name), row(3, c.name)];

function names(plan: { name: string }[]) {
	return plan.map((step) => step.name);
}

describe('selection', () => {
	test('defaults to the latest applied migration', () => {
		expect(names(planRollback({ localMigrations: [a, b, c], dbMigrations: applied }))).toStrictEqual([c.name]);
	});

	test('steps walks back newest-first regardless of journal row order', () => {
		const plan = planRollback({
			localMigrations: [a, b, c],
			dbMigrations: [applied[1]!, applied[2]!, applied[0]!],
			options: { steps: 2 },
		});
		expect(names(plan)).toStrictEqual([c.name, b.name]);
	});

	test('to keeps the named migration as the latest applied', () => {
		const plan = planRollback({ localMigrations: [a, b, c], dbMigrations: applied, options: { to: a.name } });
		expect(names(plan)).toStrictEqual([c.name, b.name]);
	});

	test('to the latest applied migration is a no-op', () => {
		expect(planRollback({ localMigrations: [a, b, c], dbMigrations: applied, options: { to: c.name } }))
			.toStrictEqual([]);
	});

	test('steps beyond the journal rolls back everything applied', () => {
		const plan = planRollback({ localMigrations: [a, b, c], dbMigrations: applied, options: { steps: 10 } });
		expect(names(plan)).toStrictEqual([c.name, b.name, a.name]);
	});

	test('an empty journal plans nothing', () => {
		expect(planRollback({ localMigrations: [a], dbMigrations: [] })).toStrictEqual([]);
	});

	test('numeric ids returned as strings are ordered numerically', () => {
		const plan = planRollback({
			localMigrations: [a, b],
			dbMigrations: [{ ...row(9, a.name), id: '9' }, { ...row(10, b.name), id: '10' }],
		});
		expect(plan[0]).toMatchObject({ id: 10, name: b.name });
	});
});

describe('options validation', () => {
	for (const steps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1; drop table a' as unknown as number]) {
		test(`rejects steps = ${String(steps)}`, () => {
			expect(() => planRollback({ localMigrations: [a], dbMigrations: applied, options: { steps } })).toThrow(
				/`steps` must be a positive integer/,
			);
		});
	}

	test('rejects steps and to together', () => {
		expect(() => planRollback({ localMigrations: [a], dbMigrations: applied, options: { steps: 1, to: a.name } }))
			.toThrow(/either `steps` or `to`/);
	});

	test('rejects a to that is not applied', () => {
		expect(() => planRollback({ localMigrations: [a], dbMigrations: applied, options: { to: '20990101000000_nope' } }))
			.toThrow(/no applied migration has that name/);
	});
});

describe('matching applied rows to local migrations', () => {
	test('matches by name even when migration.sql changed after it was applied', () => {
		const edited = local(c.name, ['DROP TABLE c'], 'hash_after_reformat');
		expect(planRollback({ localMigrations: [a, b, edited], dbMigrations: applied })).toMatchObject([
			{ name: c.name, hash: 'hash_after_reformat' },
		]);
	});

	test('legacy rows without a name fall back to the hash', () => {
		expect(names(planRollback({ localMigrations: [a, b], dbMigrations: [row(1, null, b.hash)] }))).toStrictEqual([
			b.name,
		]);
	});

	test('bundled migrations generated in the same second resolve by name', () => {
		const first = local('20240101000000_first', ['DROP TABLE first'], '');
		const second = local('20240101000000_second', ['DROP TABLE second'], '');
		const plan = planRollback({
			localMigrations: [first, second],
			dbMigrations: [row(1, first.name, '', first.folderMillis), row(2, second.name, '', second.folderMillis)],
		});
		expect(plan).toMatchObject([{ id: 2, name: second.name, downSql: ['DROP TABLE second'] }]);
	});
});

describe('down SQL validation', () => {
	function reject(downSql: string[] | undefined) {
		return () =>
			planRollback({ localMigrations: [a, b, local(c.name, downSql)], dbMigrations: applied, options: { steps: 1 } });
	}

	test('a missing down.sql is rejected', () => {
		expect(reject(undefined)).toThrow(/has no down SQL/);
	});

	test('the untouched --custom scaffold counts as missing', () => {
		expect(reject(['-- Custom SQL rollback file, put your reverse statements below! --'])).toThrow(/has no down SQL/);
	});

	test('a banner-only file counts as missing', () => {
		expect(reject(['-- drizzle:up-hash=abc\n/* warning:\n data loss */\n', '\n  \n'])).toThrow(/has no down SQL/);
	});

	test('comment-only and empty chunks are dropped, statements keep their comments', () => {
		const plan = planRollback({
			localMigrations: [local(a.name, ['-- header only\n', '-- why\nDROP TABLE a;', '  '])],
			dbMigrations: [row(1, a.name)],
		});
		expect(plan[0]!.downSql).toStrictEqual(['-- why\nDROP TABLE a;']);
	});

	test('every problem in the range is reported before anything is planned', () => {
		let error: unknown;
		try {
			planRollback({
				localMigrations: [a, local(b.name), c],
				dbMigrations: [...applied, row(4, '20240104000000_gone')],
				options: { steps: 3 },
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(DrizzleError);
		expect((error as Error).message).toBe(
			'Cannot rollback:\n'
				+ '- migration 20240104000000_gone is applied but its migration folder was not found\n'
				+ '- migration 20240102000000_b has no down SQL; add statements to its down.sql',
		);
	});
});
