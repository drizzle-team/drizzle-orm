import { entityKind, is } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { NonArray, Writable } from '~/utils.ts';
import { type PgEnum, type PgEnumObject, pgEnumObjectWithSchema, pgEnumWithSchema } from './columns/enum.ts';
import { type pgSequence, pgSequenceWithSchema } from './sequence.ts';
import { type PgTableFn, pgTableWithSchema } from './table.ts';
import { type pgMaterializedView, pgMaterializedViewWithSchema, type pgView, pgViewWithSchema } from './view.ts';

export class PgSchema<TName extends string = string> implements SQLWrapper {
	static readonly [entityKind]: string = 'PgSchema';
	constructor(
		public readonly schemaName: TName,
	) {}

	table: PgTableFn<TName> = ((name, columns, extraConfig) => {
		return pgTableWithSchema(name, columns, extraConfig, this.schemaName);
	});

	view = ((name, columns) => {
		return pgViewWithSchema(name, columns, this.schemaName);
	}) as typeof pgView;

	materializedView = ((name, columns) => {
		return pgMaterializedViewWithSchema(name, columns, this.schemaName);
	}) as typeof pgMaterializedView;

	public enum<U extends string, T extends Readonly<[U, ...U[]]>>(
		enumName: string,
		values: T | Writable<T>,
	): PgEnum<Writable<T>>;

	public enum<E extends Record<string, string>>(
		enumName: string,
		enumObj: NonArray<E>,
	): PgEnumObject<E>;

	public enum(enumName: any, input: any): any {
		return Array.isArray(input)
			? pgEnumWithSchema(
				enumName,
				[...input] as [string, ...string[]],
				this.schemaName,
			)
			: pgEnumObjectWithSchema(enumName, input, this.schemaName);
	}

	sequence: typeof pgSequence = ((name, options) => {
		return pgSequenceWithSchema(name, options, this.schemaName);
	});

	getSQL(): SQL {
		return new SQL([sql.identifier(this.schemaName)]);
	}

	shouldOmitSQLParens(): boolean {
		return true;
	}
}

export function isPgSchema(obj: unknown): obj is PgSchema {
	return is(obj, PgSchema);
}

export function pgSchema<T extends string>(name: T) {
	if (name === 'public') {
		throw new Error(
			`You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use pgTable() instead of creating a schema`,
		);
	}

	return new PgSchema(name);
}
