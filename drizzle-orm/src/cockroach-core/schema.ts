import { entityKind, is } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { NonArray, Writable } from '~/utils.ts';
import {
	type CockroachEnum,
	type CockroachEnumObject,
	cockroachEnumObjectWithSchema,
	cockroachEnumWithSchema,
} from './columns/enum.ts';
import { type cockroachSequence, cockroachSequenceWithSchema } from './sequence.ts';
import { type CockroachTableFn, type CockroachTableFnInternal, cockroachTableWithSchema, EnableRLS } from './table.ts';
import {
	type cockroachMaterializedView,
	cockroachMaterializedViewWithSchema,
	type cockroachView,
	cockroachViewWithSchema,
} from './view.ts';

export class CockroachSchema<TName extends string = string> implements SQLWrapper {
	static readonly [entityKind]: string = 'CockroachSchema';

	isExisting: boolean = false;
	constructor(
		public readonly schemaName: TName,
	) {
		this.table = Object.assign(this.table, {
			withRLS: ((name, columns, extraConfig) => {
				const table = cockroachTableWithSchema(name, columns, extraConfig, this.schemaName);
				table[EnableRLS] = true;

				return table;
			}) as CockroachTableFnInternal<TName>,
		});
	}

	table: CockroachTableFn<TName> = ((name, columns, extraConfig) => {
		return cockroachTableWithSchema(name, columns, extraConfig, this.schemaName);
	}) as CockroachTableFn<TName>;

	view = ((name, columns) => {
		return cockroachViewWithSchema(name, columns, this.schemaName);
	}) as typeof cockroachView;

	materializedView = ((name, columns) => {
		return cockroachMaterializedViewWithSchema(name, columns, this.schemaName);
	}) as typeof cockroachMaterializedView;

	public enum<U extends string, T extends Readonly<[U, ...U[]]>>(
		enumName: string,
		values: T | Writable<T>,
	): CockroachEnum<Writable<T>>;

	public enum<E extends Record<string, string>>(
		enumName: string,
		enumObj: NonArray<E>,
	): CockroachEnumObject<E>;

	public enum(enumName: any, input: any): any {
		return Array.isArray(input)
			? cockroachEnumWithSchema(
				enumName,
				[...input] as [string, ...string[]],
				this.schemaName,
			)
			: cockroachEnumObjectWithSchema(enumName, input, this.schemaName);
	}

	sequence: typeof cockroachSequence = ((name, options) => {
		return cockroachSequenceWithSchema(name, options, this.schemaName);
	});

	getSQL(): SQL {
		return new SQL([sql.identifier(this.schemaName)]);
	}

	shouldOmitSQLParens(): boolean {
		return true;
	}

	existing(): this {
		this.isExisting = true;
		return this;
	}
}

export function isCockroachSchema(obj: unknown): obj is CockroachSchema {
	return is(obj, CockroachSchema);
}

export function cockroachSchema<T extends string>(name: T) {
	if (name === 'public') {
		throw new Error(
			`You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use cockroachTable() instead of creating a schema`,
		);
	}

	return new CockroachSchema(name);
}
