import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { SQL, type SQLWrapper } from '~/sql/sql';
import type { AnyPgRole } from './role';

export type PgPolicyFor = 'select' | 'insert' | 'update' | 'delete' | 'all';

export type PgPolicyTo = 'public' | 'current_role' | 'current_user' | 'session_user';

export type PgPolicyAs = 'permissive' | 'restrictive';

export type PgPolicyConfig = {
	as?: PgPolicyAs;
	for?: PgPolicyFor;
	to?: (AnyPgRole | PgPolicyTo)[];
	using?: SQL;
	withCheck?: SQL;
};

export const PolicyName = Symbol.for('drizzle:PolicyName');
export const PolicyTable = Symbol.for('drizzle:PolicyTable');

export class PgPolicy<
	TName extends string,
	TTable extends AnyPgTable,
	TConfig extends PgPolicyConfig | undefined,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'PgPolicy';

	[PolicyName]: TName;
	[PolicyTable]: TTable;
	config: TConfig;

	declare readonly _: {
		readonly brand: 'PgPolicy';
		readonly name: TName;
		readonly table: TTable;
		readonly config: TConfig;
	};

	constructor(name: TName, table: TTable, config: TConfig) {
		this[PolicyName] = name;
		this[PolicyTable] = table;
		this.config = config;
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export function pgPolicy<TName extends string, TTable extends AnyPgTable, TConfig extends PgPolicyConfig>(
	name: TName,
	table: TTable,
	config?: TConfig,
): PgPolicy<TName, TTable, TConfig> {
	return new PgPolicy(name, table, config as TConfig);
}
