import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { PgTable } from './table.ts';

export type PgTriggerEvent = 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
export type PgTriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF';
export type PgTriggerOrientation = 'ROW' | 'STATEMENT';

export interface PgTriggerConfig {
	/**
	 * When the trigger fires: BEFORE, AFTER, or INSTEAD OF
	 */
	when: PgTriggerTiming;

	/**
	 * One or more events that fire the trigger
	 */
	events: [PgTriggerEvent, ...PgTriggerEvent[]];

	/**
	 * FOR EACH ROW or FOR EACH STATEMENT
	 * @default 'STATEMENT'
	 */
	forEach?: PgTriggerOrientation;

	/**
	 * For UPDATE triggers, optionally specify which columns trigger the event
	 */
	columns?: string[];

	/**
	 * Optional WHEN condition for the trigger
	 */
	condition?: SQL;

	/**
	 * The function to execute, e.g. 'my_function()' or sql`my_schema.my_function()`
	 */
	execute: SQL;

	/**
	 * If true, adds OR REPLACE (PostgreSQL 14+)
	 */
	replace?: boolean;

	/**
	 * If true, creates a CONSTRAINT trigger
	 */
	isConstraint?: boolean;

	/**
	 * For CONSTRAINT triggers: DEFERRABLE / NOT DEFERRABLE
	 */
	deferrable?: boolean;

	/**
	 * For CONSTRAINT triggers: INITIALLY IMMEDIATE / INITIALLY DEFERRED
	 */
	deferred?: boolean;

	/**
	 * Referencing clause for transition tables (REFERENCING OLD TABLE AS ... NEW TABLE AS ...)
	 */
	referencingOldTableAs?: string;
	referencingNewTableAs?: string;
}

export class PgTrigger {
	static readonly [entityKind]: string = 'PgTrigger';

	/** @internal */
	_linkedTable?: PgTable;

	readonly when: PgTriggerConfig['when'];
	readonly events: PgTriggerConfig['events'];
	readonly forEach: PgTriggerConfig['forEach'];
	readonly columns: PgTriggerConfig['columns'];
	readonly condition: PgTriggerConfig['condition'];
	readonly execute: PgTriggerConfig['execute'];
	readonly replace: PgTriggerConfig['replace'];
	readonly isConstraint: PgTriggerConfig['isConstraint'];
	readonly deferrable: PgTriggerConfig['deferrable'];
	readonly deferred: PgTriggerConfig['deferred'];
	readonly referencingOldTableAs: PgTriggerConfig['referencingOldTableAs'];
	readonly referencingNewTableAs: PgTriggerConfig['referencingNewTableAs'];

	constructor(
		readonly name: string,
		config: PgTriggerConfig,
	) {
		this.when = config.when;
		this.events = config.events;
		this.forEach = config.forEach;
		this.columns = config.columns;
		this.condition = config.condition;
		this.execute = config.execute;
		this.replace = config.replace;
		this.isConstraint = config.isConstraint;
		this.deferrable = config.deferrable;
		this.deferred = config.deferred;
		this.referencingOldTableAs = config.referencingOldTableAs;
		this.referencingNewTableAs = config.referencingNewTableAs;
	}

	link(table: PgTable): this {
		this._linkedTable = table;
		return this;
	}
}

/**
 * Define a PostgreSQL trigger on a table.
 *
 * @example
 * Fluent builder API:
 * ```ts
 * import { pgTable, integer, timestamp, pgTrigger } from 'drizzle-orm/pg-core';
 * import { sql } from 'drizzle-orm';
 *
 * export const users = pgTable('users', {
 *   id: integer().primaryKey(),
 *   updatedAt: timestamp('updated_at').defaultNow().notNull(),
 * }, () => [
 *   pgTrigger('set_updated_at')
 *     .before()
 *     .update()
 *     .forEach('ROW')
 *     .execute(sql`set_updated_at()`),
 * ]);
 * ```
 *
 * Config object API:
 * ```ts
 * pgTrigger('set_updated_at', {
 *   when: 'BEFORE',
 *   events: ['UPDATE'],
 *   forEach: 'ROW',
 *   execute: sql`set_updated_at()`,
 * })
 * ```
 *
 * Multiple events:
 * ```ts
 * pgTrigger('audit_changes')
 *   .after()
 *   .insert()
 *   .update()
 *   .delete()
 *   .forEach('ROW')
 *   .execute(sql`audit_trigger_func()`)
 * ```
 */
export function pgTrigger(name: string, config: PgTriggerConfig): PgTrigger;
export function pgTrigger(name: string): PgTriggerBuilder;
export function pgTrigger(name: string, config?: PgTriggerConfig): PgTrigger | PgTriggerBuilder {
	if (config) {
		return new PgTrigger(name, config);
	}
	return new PgTriggerBuilder(name);
}

/**
 * Fluent builder for creating PostgreSQL triggers.
 */
export class PgTriggerBuilder {
	static readonly [entityKind]: string = 'PgTriggerBuilder';

	private _when?: PgTriggerTiming;
	private _events: PgTriggerEvent[] = [];
	private _forEach?: PgTriggerOrientation;
	private _columns?: string[];
	private _condition?: SQL;
	private _replace?: boolean;
	private _isConstraint?: boolean;
	private _deferrable?: boolean;
	private _deferred?: boolean;
	private _referencingOldTableAs?: string;
	private _referencingNewTableAs?: string;

	constructor(private readonly _name: string) {}

	/** Set trigger timing to BEFORE */
	before(): this {
		this._when = 'BEFORE';
		return this;
	}

	/** Set trigger timing to AFTER */
	after(): this {
		this._when = 'AFTER';
		return this;
	}

	/** Set trigger timing to INSTEAD OF */
	insteadOf(): this {
		this._when = 'INSTEAD OF';
		return this;
	}

	/** Add INSERT to trigger events */
	insert(): this {
		this._events.push('INSERT');
		return this;
	}

	/** Add UPDATE to trigger events */
	update(...columns: string[]): this {
		this._events.push('UPDATE');
		if (columns.length > 0) {
			this._columns = columns;
		}
		return this;
	}

	/** Add DELETE to trigger events */
	delete(): this {
		this._events.push('DELETE');
		return this;
	}

	/** Add TRUNCATE to trigger events */
	truncate(): this {
		this._events.push('TRUNCATE');
		return this;
	}

	/** Set FOR EACH ROW or FOR EACH STATEMENT */
	forEach(orientation: PgTriggerOrientation): this {
		this._forEach = orientation;
		return this;
	}

	/** Set a WHEN condition */
	when(condition: SQL): this {
		this._condition = condition;
		return this;
	}

	/** Use CREATE OR REPLACE TRIGGER (PostgreSQL 14+) */
	orReplace(): this {
		this._replace = true;
		return this;
	}

	/** Create a CONSTRAINT trigger */
	constraint(): this {
		this._isConstraint = true;
		return this;
	}

	/** Mark trigger as DEFERRABLE */
	asDeferrable(): this {
		this._deferrable = true;
		return this;
	}

	/** Mark trigger as INITIALLY DEFERRED */
	initiallyDeferred(): this {
		this._deferred = true;
		return this;
	}

	/** Set REFERENCING OLD TABLE AS */
	referencingOldTableAs(name: string): this {
		this._referencingOldTableAs = name;
		return this;
	}

	/** Set REFERENCING NEW TABLE AS */
	referencingNewTableAs(name: string): this {
		this._referencingNewTableAs = name;
		return this;
	}

	/**
	 * Specify the function to execute and finalize the trigger.
	 * @param fn - The function call as SQL, e.g. sql`my_function()`
	 */
	execute(fn: SQL): PgTrigger {
		if (!this._when) {
			throw new Error(`Trigger "${this._name}" must specify timing (before/after/insteadOf)`);
		}
		if (this._events.length === 0) {
			throw new Error(`Trigger "${this._name}" must specify at least one event (insert/update/delete/truncate)`);
		}

		return new PgTrigger(this._name, {
			when: this._when,
			events: this._events as [PgTriggerEvent, ...PgTriggerEvent[]],
			forEach: this._forEach,
			columns: this._columns,
			condition: this._condition,
			execute: fn,
			replace: this._replace,
			isConstraint: this._isConstraint,
			deferrable: this._deferrable,
			deferred: this._deferred,
			referencingOldTableAs: this._referencingOldTableAs,
			referencingNewTableAs: this._referencingNewTableAs,
		});
	}
}
