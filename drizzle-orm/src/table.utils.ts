/** @internal */
export const TableName = Symbol.for('drizzle:Name');

/** @internal */
export const throwUnknownExtraConfigValue = (value: unknown) => {
	const constructorName = (value as { constructor?: { name?: string } })?.constructor?.name;
	throw new Error(
		`Can't use "${constructorName}" as an extra config value. Use one of: IndexBuilder, CheckBuilder, UniqueConstraintBuilder, PrimaryKeyBuilder, ForeignKeyBuilder${
			constructorName === 'PgPolicy' || constructorName === 'GelPolicy' ? ', PgPolicy/GelPolicy' : ''
		}.`,
	);
};
