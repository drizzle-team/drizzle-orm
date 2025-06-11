import { entityKind, is } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { NonArray, Writable } from '~/utils.ts';
import {
	type CockroachDbEnum,
	type CockroachDbEnumObject,
	cockroachdbEnumObjectWithSchema,
	cockroachdbEnumWithSchema,
} from './columns/enum.ts';
import { type cockroachdbSequence, cockroachdbSequenceWithSchema } from './sequence.ts';
import { type CockroachDbTableFn, cockroachdbTableWithSchema } from './table.ts';
import {
	type cockroachdbMaterializedView,
	cockroachdbMaterializedViewWithSchema,
	type cockroachdbView,
	cockroachdbViewWithSchema,
} from './view.ts';

export class CockroachDbSchema<TName extends string = string> implements SQLWrapper {
	static readonly [entityKind]: string = 'CockroachDbSchema';
	constructor(
		public readonly schemaName: TName,
	) {}

	table: CockroachDbTableFn<TName> = ((name, columns, extraConfig) => {
		return cockroachdbTableWithSchema(name, columns, extraConfig, this.schemaName);
	});

	view = ((name, columns) => {
		return cockroachdbViewWithSchema(name, columns, this.schemaName);
	}) as typeof cockroachdbView;

	materializedView = ((name, columns) => {
		return cockroachdbMaterializedViewWithSchema(name, columns, this.schemaName);
	}) as typeof cockroachdbMaterializedView;

	public enum<U extends string, T extends Readonly<[U, ...U[]]>>(
		enumName: string,
		values: T | Writable<T>,
	): CockroachDbEnum<Writable<T>>;

	public enum<E extends Record<string, string>>(
		enumName: string,
		enumObj: NonArray<E>,
	): CockroachDbEnumObject<E>;

	public enum(enumName: any, input: any): any {
		return Array.isArray(input)
			? cockroachdbEnumWithSchema(
				enumName,
				[...input] as [string, ...string[]],
				this.schemaName,
			)
			: cockroachdbEnumObjectWithSchema(enumName, input, this.schemaName);
	}

	sequence: typeof cockroachdbSequence = ((name, options) => {
		return cockroachdbSequenceWithSchema(name, options, this.schemaName);
	});

	getSQL(): SQL {
		return new SQL([sql.identifier(this.schemaName)]);
	}

	shouldOmitSQLParens(): boolean {
		return true;
	}
}

export function isCockroachDbSchema(obj: unknown): obj is CockroachDbSchema {
	return is(obj, CockroachDbSchema);
}

export function cockroachdbSchema<T extends string>(name: T) {
	if (name === 'public') {
		throw new Error(
			`You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use pgTable() instead of creating a schema`,
		);
	}

	return new CockroachDbSchema(name);
}
