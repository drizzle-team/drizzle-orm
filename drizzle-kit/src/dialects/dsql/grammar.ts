/**
 * DSQL-specific grammar definitions.
 *
 * DSQL has its own system namespaces and roles that differ from standard PostgreSQL.
 */

/**
 * DSQL system namespace names that should be excluded from introspection.
 * - 'sys': Contains DSQL internal tables and views (e.g., jobs, iam_pg_role_mappings)
 * - Standard PostgreSQL system namespaces are also excluded via pg grammar
 */
export const systemNamespaceNames = ['sys', 'pg_catalog', 'information_schema', 'pg_toast'];

export const isSystemNamespace = (name: string) => {
	return name.startsWith('pg_toast') || name.startsWith('pg_temp_') || systemNamespaceNames.indexOf(name) >= 0;
};

/**
 * DSQL system roles that should be excluded from introspection.
 * These are IAM-managed roles that cannot be modified via SQL.
 */
export const systemRoles = ['admin', 'postgres'];

export const isSystemRole = (name: string) => {
	return name.startsWith('pg_') || systemRoles.indexOf(name) >= 0;
};
