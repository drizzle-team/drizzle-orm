import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface DSQLInsertConfig {
	table: DSQLTable;
	values: Record<string, unknown>[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export class DSQLInsertBuilder<TTable extends DSQLTable> {
	static readonly [entityKind]: string = 'DSQLInsertBuilder';

	constructor(
		table: TTable,
		session: DSQLSession | undefined,
		dialect: DSQLDialect,
	) {
		throw new Error('Method not implemented.');
	}

	values(values: Record<string, unknown> | Record<string, unknown>[]): DSQLInsertBase<TTable, any, any> {
		throw new Error('Method not implemented.');
	}
}

export class DSQLInsertBase<
	TTable extends DSQLTable,
	TQueryResult,
	TReturning = undefined,
> {
	static readonly [entityKind]: string = 'DSQLInsert';

	protected config: DSQLInsertConfig;

	constructor(
		table: TTable,
		values: Record<string, unknown>[],
		session: DSQLSession | undefined,
		dialect: DSQLDialect,
	) {
		throw new Error('Method not implemented.');
	}

	returning(): DSQLInsertBase<TTable, any, any> {
		throw new Error('Method not implemented.');
	}

	onConflictDoNothing(config?: { target?: any }): this {
		throw new Error('Method not implemented.');
	}

	onConflictDoUpdate(config: { target?: any; set: Record<string, unknown> }): this {
		throw new Error('Method not implemented.');
	}

	toSQL(): { sql: string; params: unknown[] } {
		throw new Error('Method not implemented.');
	}

	getSQL(): SQL {
		throw new Error('Method not implemented.');
	}

	execute(): Promise<any> {
		throw new Error('Method not implemented.');
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		throw new Error('Method not implemented.');
	}
}
