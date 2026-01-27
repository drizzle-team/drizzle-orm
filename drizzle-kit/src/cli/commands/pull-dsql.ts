import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { render, renderWithTask } from 'hanji';
import { join } from 'path';
import { interimToDDL, postgresToRelationsPull } from 'src/dialects/postgres/ddl';
import { ddlToTypeScript } from 'src/dialects/postgres/typescript';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { fromDatabase } from '../../dialects/dsql/introspect';
import type { DB } from '../../utils';
import type { EntitiesFilterConfig } from '../validations/cli';
import type { Casing } from '../validations/common';
import { IntrospectProgress } from '../views';
import { relationsToTypeScript } from './pull-common';

export interface DsqlCredentials {
	endpoint: string;
	region: string;
}

export const prepareDsqlDB = async (
	credentials: DsqlCredentials,
): Promise<DB> => {
	const { drizzle } = await import('drizzle-orm/dsql');
	const { sql } = await import('drizzle-orm');

	const db = drizzle({
		connection: {
			endpoint: credentials.endpoint,
			region: credentials.region,
		},
	});

	// Test connection
	await db.execute(sql`SELECT 1`);

	return {
		query: async <T>(sqlStr: string, _params?: any[]): Promise<T[]> => {
			const result = await db.execute(sql.raw(sqlStr));
			return (result as any).rows as T[];
		},
	};
};

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: DsqlCredentials,
	filters: EntitiesFilterConfig,
	db?: DB,
) => {
	if (!db) {
		db = await prepareDsqlDB(credentials);
	}

	const progress = new IntrospectProgress(true);
	const entityFilter = prepareEntityFilter('postgresql', filters, []);

	// Use PostgreSQL's introspection (DSQL is PG-compatible)
	const task = fromDatabase(db, entityFilter, (stage, count, status) => {
		progress.update(stage, count, status);
	});

	const res = await renderWithTask(progress, task);

	// Use PostgreSQL's DDL conversion
	const { ddl, errors } = interimToDDL(res);

	if (errors.length > 0) {
		console.error('Schema errors:', errors);
		process.exit(1);
	}

	// Generate TypeScript with 'dsql' dialect
	const ts = ddlToTypeScript(ddl, res.viewColumns, casing, 'dsql');
	const relationsTs = relationsToTypeScript(postgresToRelationsPull(ddl), casing);

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	render(
		`[${chalk.green('✓')}] Your schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
	);
	render(
		`[${chalk.green('✓')}] Your relations file is ready ➜ ${chalk.bold.underline.blue(relationsFile)} 🚀`,
	);
};
