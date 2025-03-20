export const parseType = (schemaPrefix: string, type: string) => {
	const NativeTypes = [
		'uuid',
		'smallint',
		'integer',
		'bigint',
		'boolean',
		'text',
		'varchar',
		'serial',
		'bigserial',
		'decimal',
		'numeric',
		'real',
		'json',
		'jsonb',
		'time',
		'time with time zone',
		'time without time zone',
		'time',
		'timestamp',
		'timestamp with time zone',
		'timestamp without time zone',
		'date',
		'interval',
		'bigint',
		'bigserial',
		'double precision',
		'interval year',
		'interval month',
		'interval day',
		'interval hour',
		'interval minute',
		'interval second',
		'interval year to month',
		'interval day to hour',
		'interval day to minute',
		'interval day to second',
		'interval hour to minute',
		'interval hour to second',
		'interval minute to second',
		'char',
		'vector',
		'geometry',
	];
	const arrayDefinitionRegex = /\[\d*(?:\[\d*\])*\]/g;
	const arrayDefinition = (type.match(arrayDefinitionRegex) ?? []).join('');
	const withoutArrayDefinition = type.replace(arrayDefinitionRegex, '');
	return NativeTypes.some((it) => type.startsWith(it))
		? `${withoutArrayDefinition}${arrayDefinition}`
		: `${schemaPrefix}"${withoutArrayDefinition}"${arrayDefinition}`;
};

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

export function stringFromIdentityProperty(field: string | number | undefined): string | undefined {
	return typeof field === 'string' ? (field as string) : typeof field === 'undefined' ? undefined : String(field);
}

export function maxRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '2147483647' : columnType === 'bigint' ? '9223372036854775807' : '32767';
}

export function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '-2147483648' : columnType === 'bigint' ? '-9223372036854775808' : '-32768';
}

export function stringFromDatabaseIdentityProperty(field: any): string | undefined {
	return typeof field === 'string'
		? (field as string)
		: typeof field === 'undefined'
		? undefined
		: typeof field === 'bigint'
		? field.toString()
		: String(field);
}

export const defaults = {
		/*
			By default, PostgreSQL uses the cluster’s default tablespace (which is named 'pg_default')

			This operation requires an exclusive lock on the materialized view (it rewrites the data file),
			and you must have CREATE privilege on the target tablespace.
			If you have indexes on the materialized view, note that moving the base table does not automatically move its indexes.
			Each index is a separate object and retains its original tablespace​.

			You should move indexes individually, for example:
			sql`ALTER INDEX my_matview_idx1 SET TABLESPACE pg_default`;
			sql`ALTER INDEX my_matview_idx2 SET TABLESPACE pg_default`;
		*/
		tablespace: 'pg_default',

		/*
		The table access method (the storage engine format) is chosen when the materialized view is created,
		 using the optional USING <method> clause.
		 If no method is specified, it uses the default access method (typically the regular heap storage)​

		sql`
			CREATE MATERIALIZED VIEW my_matview
			USING heap  -- storage access method; "heap" is the default
			AS SELECT ...;
		`

		Starting with PostgreSQL 15, you can alter a materialized view’s access method in-place.
		PostgreSQL 15 introduced support for ALTER MATERIALIZED VIEW ... SET ACCESS METHOD new_method
		*/
		accessMethod: 'heap',
} as const;
