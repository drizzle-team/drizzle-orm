import { describe, expect, it } from 'vitest';
import { sql } from '~/sql/sql.ts';
import { pgTable, integer, timestamp, pgTrigger, getTableConfig } from '~/pg-core/index.ts';

describe('pgTrigger', () => {
	it('creates a trigger with config object API', () => {
		const trigger = pgTrigger('set_updated_at', {
			when: 'BEFORE',
			events: ['UPDATE'],
			forEach: 'ROW',
			execute: sql`set_updated_at()`,
		});

		expect(trigger.name).toBe('set_updated_at');
		expect(trigger.when).toBe('BEFORE');
		expect(trigger.events).toEqual(['UPDATE']);
		expect(trigger.forEach).toBe('ROW');
	});

	it('creates a trigger with fluent builder API', () => {
		const trigger = pgTrigger('audit_trigger')
			.after()
			.insert()
			.update()
			.delete()
			.forEach('ROW')
			.execute(sql`audit_func()`);

		expect(trigger.name).toBe('audit_trigger');
		expect(trigger.when).toBe('AFTER');
		expect(trigger.events).toEqual(['INSERT', 'UPDATE', 'DELETE']);
		expect(trigger.forEach).toBe('ROW');
	});

	it('creates a BEFORE trigger', () => {
		const trigger = pgTrigger('before_trigger')
			.before()
			.insert()
			.execute(sql`my_func()`);

		expect(trigger.when).toBe('BEFORE');
	});

	it('creates an INSTEAD OF trigger', () => {
		const trigger = pgTrigger('instead_trigger')
			.insteadOf()
			.insert()
			.execute(sql`my_func()`);

		expect(trigger.when).toBe('INSTEAD OF');
	});

	it('supports UPDATE OF columns', () => {
		const trigger = pgTrigger('col_trigger')
			.before()
			.update('name', 'email')
			.forEach('ROW')
			.execute(sql`check_cols()`);

		expect(trigger.columns).toEqual(['name', 'email']);
	});

	it('supports OR REPLACE', () => {
		const trigger = pgTrigger('replaceable')
			.before()
			.insert()
			.orReplace()
			.execute(sql`my_func()`);

		expect(trigger.replace).toBe(true);
	});

	it('supports CONSTRAINT triggers', () => {
		const trigger = pgTrigger('constraint_trigger')
			.after()
			.insert()
			.constraint()
			.asDeferrable()
			.initiallyDeferred()
			.execute(sql`validate_func()`);

		expect(trigger.isConstraint).toBe(true);
		expect(trigger.deferrable).toBe(true);
		expect(trigger.deferred).toBe(true);
	});

	it('supports REFERENCING clause', () => {
		const trigger = pgTrigger('ref_trigger')
			.after()
			.insert()
			.forEach('STATEMENT')
			.referencingNewTableAs('new_rows')
			.execute(sql`batch_func()`);

		expect(trigger.referencingNewTableAs).toBe('new_rows');
	});

	it('throws when timing is not specified', () => {
		expect(() => {
			pgTrigger('bad_trigger')
				.insert()
				.execute(sql`my_func()`);
		}).toThrow('must specify timing');
	});

	it('throws when no events are specified', () => {
		expect(() => {
			pgTrigger('bad_trigger')
				.before()
				.execute(sql`my_func()`);
		}).toThrow('must specify at least one event');
	});

	it('works as table extra config', () => {
		const users = pgTable('users', {
			id: integer().primaryKey(),
			updatedAt: timestamp('updated_at').defaultNow().notNull(),
		}, () => [
			pgTrigger('set_updated_at', {
				when: 'BEFORE',
				events: ['UPDATE'],
				forEach: 'ROW',
				execute: sql`set_updated_at()`,
			}),
		]);

		const config = getTableConfig(users);
		expect(config.triggers).toHaveLength(1);
		expect(config.triggers[0]!.name).toBe('set_updated_at');
		expect(config.triggers[0]!.when).toBe('BEFORE');
		expect(config.triggers[0]!.events).toEqual(['UPDATE']);
		expect(config.triggers[0]!.forEach).toBe('ROW');
	});

	it('works with fluent builder in table extra config', () => {
		const orders = pgTable('orders', {
			id: integer().primaryKey(),
		}, () => [
			pgTrigger('audit_orders')
				.after()
				.insert()
				.update()
				.delete()
				.forEach('ROW')
				.execute(sql`audit_func()`),
		]);

		const config = getTableConfig(orders);
		expect(config.triggers).toHaveLength(1);
		expect(config.triggers[0]!.name).toBe('audit_orders');
		expect(config.triggers[0]!.events).toEqual(['INSERT', 'UPDATE', 'DELETE']);
	});

	it('supports multiple triggers on the same table', () => {
		const users = pgTable('users', {
			id: integer().primaryKey(),
			updatedAt: timestamp('updated_at').defaultNow().notNull(),
		}, () => [
			pgTrigger('set_updated_at')
				.before()
				.update()
				.forEach('ROW')
				.execute(sql`set_updated_at()`),
			pgTrigger('audit_users')
				.after()
				.insert()
				.update()
				.delete()
				.forEach('ROW')
				.execute(sql`audit_func()`),
		]);

		const config = getTableConfig(users);
		expect(config.triggers).toHaveLength(2);
		expect(config.triggers[0]!.name).toBe('set_updated_at');
		expect(config.triggers[1]!.name).toBe('audit_users');
	});
});
