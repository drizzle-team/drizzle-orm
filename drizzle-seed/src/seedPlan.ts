import type { SQL } from 'drizzle-orm';
import { SeedService } from './SeedService.ts';
import type { ConnectionType, DbType, RefinementsType, SeedOperation, TableType } from './types/seedService.ts';
import type { Relation, Table } from './types/tables.ts';

/**
 * Everything needed to turn a seed into something other than rows in a database: the writes it consists of, and the
 * tables they refer to, which is what a statement has to be built against.
 */
export type SeedPlan = {
	connectionType: ConnectionType;
	operations: Generator<SeedOperation>;
	db: DbType;
	tables: { [tsTableName: string]: TableType };
};

/**
 * The whole of seeding that does not depend on the dialect: build the plan, then either run it or hand it back. Each
 * dialect only has to say which tables it found and how to read their columns.
 */
export const seedDialect = async (
	{ connectionType, db, drizzleTables, tables, relations, options, refinements }: {
		connectionType: ConnectionType;
		db: DbType;
		drizzleTables: { [tsTableName: string]: TableType };
		tables: Table[];
		relations: (Relation & { isCyclic: boolean })[];
		options?: { count?: number; seed?: number; version?: number; dryRun?: boolean };
		refinements?: RefinementsType;
	},
): Promise<SeedPlan | undefined> => {
	const seedService = new SeedService();

	if (options?.dryRun === true) {
		return {
			connectionType,
			db,
			tables: drizzleTables,
			operations: seedService.planSeed({
				connectionType,
				tables,
				relations,
				refinements,
				options,
				maxParametersNumber: seedService.getMaxParametersNumber(connectionType, db),
			}),
		};
	}

	await seedService.runSeed({
		connectionType,
		tables,
		relations,
		refinements,
		options,
		db,
		schema: drizzleTables,
	});

	return undefined;
};

/**
 * Renders a plan as statements that can be run as they are. They are built by the same code that runs them during a
 * real seed and only rendered differently, with their values written into the statement instead of being sent
 * alongside it, so what comes out here is what would have been executed.
 */
export function* renderSeedPlan({ operations, db, tables }: SeedPlan): Generator<string> {
	const seedService = new SeedService();
	const dialect = (db as unknown as { dialect: { sqlToQuery: (sql: SQL) => { sql: string } } }).dialect;
	const render = (query: { getSQL: () => SQL }) => dialect.sqlToQuery(query.getSQL().inlineParams()).sql;

	for (const operation of operations) {
		if (operation.type === 'insert') {
			const identityInsertOn = operation.override === true
				? seedService.buildIdentityInsertSql({ db, schema: tables, tableName: operation.tableName, enabled: true })
				: undefined;
			if (identityInsertOn !== undefined) yield identityInsertOn;

			yield render(
				seedService.buildInsertQuery({
					rows: operation.rows,
					db,
					schema: tables,
					tableName: operation.tableName,
					override: operation.override,
				}),
			);

			const identityInsertOff = operation.override === true
				? seedService.buildIdentityInsertSql({ db, schema: tables, tableName: operation.tableName, enabled: false })
				: undefined;
			if (identityInsertOff !== undefined) yield identityInsertOff;
		} else if (operation.type === 'update') {
			yield render(
				seedService.buildUpdateQuery({
					values: operation.values,
					db,
					schema: tables,
					tableName: operation.tableName,
					whereColumn: operation.whereColumn,
					whereValue: operation.whereValue,
				}),
			);
		} else {
			const sequenceSql = seedService.buildSequenceSql({
				db,
				schema: tables,
				tableName: operation.tableName,
				columnName: operation.columnName,
				value: operation.value,
			});
			if (sequenceSql !== undefined) yield sequenceSql;
		}
	}
}
