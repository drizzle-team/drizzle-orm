import { entityKind, is } from '~/entity.ts';
import { SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { gelSequence } from './sequence.ts';
import { gelSequenceWithSchema } from './sequence.ts';
import { type GelTableFn, gelTableWithSchema } from './table.ts';
// import type { gelMaterializedView, gelView } from './view.ts';
// import { gelMaterializedViewWithSchema, gelViewWithSchema } from './view.ts';

export class GelSchema<TName extends string = string> implements SQLWrapper {
	static readonly [entityKind]: string = 'GelSchema';
	constructor(
		public readonly schemaName: TName,
	) {}

	table: GelTableFn<TName> = ((name, columns, extraConfig) => {
		return gelTableWithSchema(name, columns, extraConfig, this.schemaName);
	});

	// view = ((name, columns) => {
	// 	return gelViewWithSchema(name, columns, this.schemaName);
	// }) as typeof gelView;

	// materializedView = ((name, columns) => {
	// 	return gelMaterializedViewWithSchema(name, columns, this.schemaName);
	// }) as typeof gelMaterializedView;

	// enum: typeof gelEnum = ((name, values) => {
	// 	return gelEnumWithSchema(name, values, this.schemaName);
	// });

	sequence: typeof gelSequence = ((name, options) => {
		return gelSequenceWithSchema(name, options, this.schemaName);
	});

	getSQL(): SQL {
		return new SQL([sql.identifier(this.schemaName)]);
	}

	shouldOmitSQLParens(): boolean {
		return true;
	}
}

export function isGelSchema(obj: unknown): obj is GelSchema {
	return is(obj, GelSchema);
}

export function gelSchema<T extends string>(name: T) {
	if (name === 'public') {
		throw new Error(
			`You can't specify 'public' as schema name. Postgres is using public schema by default. If you want to use 'public' schema, just use GelTable() instead of creating a schema`,
		);
	}

	return new GelSchema(name);
}
