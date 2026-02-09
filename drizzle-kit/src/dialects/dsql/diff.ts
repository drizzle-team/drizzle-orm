/**
 * DSQL Diff Module
 *
 * Wraps PostgreSQL diff algorithm but uses DSQL-specific SQL convertor
 * to generate DSQL-compatible DDL statements.
 *
 * Key differences from PostgreSQL:
 * - Uses CREATE INDEX ASYNC (not CONCURRENTLY)
 * - No enums, sequences, foreign keys, policies, RLS
 * - No ALTER COLUMN SET NOT NULL / DROP NOT NULL / SET DEFAULT / DROP DEFAULT
 * - Schema-qualified index names for DROP INDEX
 */

import type { Resolver } from '../common';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresDDL,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../postgres/ddl';
import { ddlDiff as pgDdlDiff, ddlDiffDry as pgDdlDiffDry } from '../postgres/diff';
import type { JsonStatement } from '../postgres/statements';
import { fromJson } from './convertor';

/**
 * Error class for unsupported DSQL operations.
 */
export class DSQLUnsupportedOperationError extends Error {
	public errors: string[];

	constructor(errors: string[]) {
		const message = `DSQL does not support the following operations:\n${errors.map((e) => `  - ${e}`).join('\n')}`;
		super(message);
		this.name = 'DSQLUnsupportedOperationError';
		this.errors = errors;
	}
}

/**
 * Performs a dry diff (without resolver prompts) using DSQL-specific SQL generation.
 * Throws DSQLUnsupportedOperationError if unsupported operations are detected.
 */
export const ddlDiffDry = async (
	ddlFrom: PostgresDDL,
	ddlTo: PostgresDDL,
	mode: 'default' | 'push',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	renames: string[];
}> => {
	// Use PostgreSQL diff to get the JSON statements
	const result = await pgDdlDiffDry(ddlFrom, ddlTo, mode);

	// Re-generate SQL using DSQL convertor for DSQL-specific syntax
	const { sqlStatements, groupedStatements, errors } = fromJson(result.statements);

	// Throw error if unsupported operations were detected
	if (errors.length > 0) {
		throw new DSQLUnsupportedOperationError(errors);
	}

	return {
		statements: result.statements,
		sqlStatements,
		groupedStatements,
		renames: result.renames,
	};
};

/**
 * Performs a full diff with resolvers using DSQL-specific SQL generation.
 * Throws DSQLUnsupportedOperationError if unsupported operations are detected.
 */
export const ddlDiff = async (
	ddl1: PostgresDDL,
	ddl2: PostgresDDL,
	schemasResolver: Resolver<Schema>,
	enumsResolver: Resolver<Enum>,
	sequencesResolver: Resolver<Sequence>,
	policyResolver: Resolver<Policy>,
	roleResolver: Resolver<Role>,
	privilegesResolver: Resolver<Privilege>,
	tablesResolver: Resolver<PostgresEntities['tables']>,
	columnsResolver: Resolver<Column>,
	viewsResolver: Resolver<View>,
	uniquesResolver: Resolver<UniqueConstraint>,
	indexesResolver: Resolver<Index>,
	checksResolver: Resolver<CheckConstraint>,
	pksResolver: Resolver<PrimaryKey>,
	fksResolver: Resolver<ForeignKey>,
	mode: 'default' | 'push',
): Promise<{
	statements: JsonStatement[];
	sqlStatements: string[];
	groupedStatements: { jsonStatement: JsonStatement; sqlStatements: string[] }[];
	renames: string[];
}> => {
	// Use PostgreSQL diff to get the JSON statements and renames
	const result = await pgDdlDiff(
		ddl1,
		ddl2,
		schemasResolver,
		enumsResolver,
		sequencesResolver,
		policyResolver,
		roleResolver,
		privilegesResolver,
		tablesResolver,
		columnsResolver,
		viewsResolver,
		uniquesResolver,
		indexesResolver,
		checksResolver,
		pksResolver,
		fksResolver,
		mode,
	);

	// Re-generate SQL using DSQL convertor for DSQL-specific syntax
	const { sqlStatements, groupedStatements, errors } = fromJson(result.statements);

	// Throw error if unsupported operations were detected
	if (errors.length > 0) {
		throw new DSQLUnsupportedOperationError(errors);
	}

	return {
		statements: result.statements,
		sqlStatements,
		groupedStatements,
		renames: result.renames,
	};
};
