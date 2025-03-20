
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