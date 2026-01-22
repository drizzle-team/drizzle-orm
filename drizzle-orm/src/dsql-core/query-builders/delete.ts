import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { SelectedFieldsOrdered } from './select.types.ts';

export interface DSQLDeleteConfig {
	table: DSQLTable;
	where?: SQL;
	returning?: SelectedFieldsOrdered;
}

export class DSQLDeleteBase<
	TTable extends DSQLTable,
	TQueryResult,
	TReturning = undefined,
> {
	static readonly [entityKind]: string = 'DSQLDelete';

	protected config: DSQLDeleteConfig;

	constructor(
		table: TTable,
		session: DSQLSession | undefined,
		dialect: DSQLDialect,
	) {
		throw new Error('Method not implemented.');
	}

	where(where: SQL | undefined): this {
		throw new Error('Method not implemented.');
	}

	returning(): DSQLDeleteBase<TTable, any, any> {
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
