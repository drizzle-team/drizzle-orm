import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { DSQLColumn } from '../columns/common.ts';
import type { DSQLDialect } from '../dialect.ts';
import type { DSQLSession } from '../session.ts';
import type { DSQLTable } from '../table.ts';
import type { DSQLSelectConfig, SelectedFieldsOrdered } from './select.types.ts';

export class DSQLSelectBuilder<TSelection = undefined> {
	static readonly [entityKind]: string = 'DSQLSelectBuilder';

	constructor(
		config: {
			fields: Record<string, unknown>;
			session: DSQLSession | undefined;
			dialect: DSQLDialect;
			withList?: any[];
			distinct?: boolean | { on: (DSQLColumn | SQL)[] };
		},
	) {
		throw new Error('Method not implemented.');
	}

	from(source: DSQLTable | SQL): DSQLSelectBase<any, any, any, any> {
		throw new Error('Method not implemented.');
	}
}

export abstract class DSQLSelectQueryBuilderBase<
	THKT extends any,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends 'partial' | 'single' | 'multiple',
> {
	static readonly [entityKind]: string = 'DSQLSelectQueryBuilder';

	protected config: DSQLSelectConfig;
	protected dialect: DSQLDialect;
	protected session: DSQLSession | undefined;

	constructor(config: {
		table: DSQLTable | SQL;
		fields: Record<string, unknown>;
		fieldsFlat?: SelectedFieldsOrdered;
		session: DSQLSession | undefined;
		dialect: DSQLDialect;
	}) {
		throw new Error('Method not implemented.');
	}

	where(where: SQL | undefined): this {
		throw new Error('Method not implemented.');
	}

	having(having: SQL | undefined): this {
		throw new Error('Method not implemented.');
	}

	groupBy(...columns: (DSQLColumn | SQL)[]): this {
		throw new Error('Method not implemented.');
	}

	orderBy(...columns: (DSQLColumn | SQL)[]): this {
		throw new Error('Method not implemented.');
	}

	limit(limit: number): this {
		throw new Error('Method not implemented.');
	}

	offset(offset: number): this {
		throw new Error('Method not implemented.');
	}

	for(
		strength: 'update' | 'no key update' | 'share' | 'key share',
		config?: { noWait?: boolean; skipLocked?: boolean },
	): this {
		throw new Error('Method not implemented.');
	}

	toSQL(): { sql: string; params: unknown[] } {
		throw new Error('Method not implemented.');
	}

	getSQL(): SQL {
		throw new Error('Method not implemented.');
	}
}

export class DSQLSelectBase<
	THKT extends any,
	TTableName extends string | undefined,
	TSelection,
	TSelectMode extends 'partial' | 'single' | 'multiple',
> extends DSQLSelectQueryBuilderBase<THKT, TTableName, TSelection, TSelectMode> {
	static override readonly [entityKind]: string = 'DSQLSelect';

	execute(): Promise<any[]> {
		throw new Error('Method not implemented.');
	}

	then<TResult1 = any[], TResult2 = never>(
		onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		throw new Error('Method not implemented.');
	}
}
