import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { Policy } from '~/policy.ts';
import type { SQL } from '~/sql/sql.ts';
import type { AnyPgRole } from './role.ts';

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

export const PolicyTable = Symbol.for('drizzle:PolicyTable');

export class PgPolicy<
	TName extends string,
	TTable extends AnyPgTable,
	TConfig extends PgPolicyConfig | undefined,
> extends Policy<TName> {
	static readonly [entityKind]: string = 'PgPolicy';

	[PolicyTable]: TTable;
	config: TConfig;

	declare readonly _: {
		readonly brand: 'PgPolicy';
		readonly name: TName;
		readonly table: TTable;
		readonly config: TConfig;
	};

	constructor(name: TName, table: TTable, config: TConfig) {
		super(name);
		this[PolicyTable] = table;
		this.config = config;
	}
}

export function pgPolicy<TName extends string, TTable extends AnyPgTable, TConfig extends PgPolicyConfig>(
	name: TName,
	table: TTable,
	config?: TConfig,
): PgPolicy<TName, TTable, TConfig> {
	return new PgPolicy(name, table, config as TConfig);
}
