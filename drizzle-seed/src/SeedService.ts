/* eslint-disable drizzle-internal/require-entity-kind */
import type { SQLWrapper } from 'drizzle-orm';
import { entityKind, eq, is, sql } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import { MySqlAsyncDatabase } from 'drizzle-orm/mysql-core';
import type { PgTable, PgTableWithColumns } from 'drizzle-orm/pg-core';
import type { PgDialect } from 'drizzle-orm/pg-core';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core';
import { generatorsMap } from './generators/GeneratorFuncs.ts';
import type {
	AbstractGenerator,
	GenerateArray,
	GenerateCompositeUniqueKey,
	GenerateHashFromString,
	GenerateWeightedCount,
	WeightedRandomGenerator,
} from './generators/Generators.ts';
import type {
	ConnectionType,
	DbType,
	GeneratedRow,
	GeneratedValueType,
	GeneratePossibleGeneratorsColumnType,
	GeneratePossibleGeneratorsTableType,
	RefinementsType,
	SeedOperation,
	TableGeneratorsType,
	TableType,
} from './types/seedService.ts';
import type { Prettify, Relation, Table } from './types/tables.ts';

import type { CockroachTable } from 'drizzle-orm/cockroach-core';
import { CockroachDatabase } from 'drizzle-orm/cockroach-core';
import type { MsSqlTable } from 'drizzle-orm/mssql-core';
import { getTableConfig as getTableConfigMsSql, MsSqlDatabase } from 'drizzle-orm/mssql-core';
import type { SingleStoreTable } from 'drizzle-orm/singlestore-core';
import type { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';
import { selectGeneratorForCockroachColumn } from './cockroach-core/selectGensForColumn.ts';
import { latestVersion } from './generators/apiVersion.ts';
import { selectGeneratorForMssqlColumn } from './mssql-core/selectGensForColumn.ts';
import { selectGeneratorForMysqlColumn } from './mysql-core/selectGensForColumn.ts';
import { selectGeneratorForPostgresColumn } from './pg-core/selectGensForColumn.ts';
import { selectGeneratorForSingleStoreColumn } from './singlestore-core/selectGensForColumn.ts';
import { selectGeneratorForSqlite } from './sqlite-core/selectGensForColumn.ts';
import { equalSets, intMax, isSequenceBackedColumn } from './utils.ts';

/** a statement that has been built but not yet run, so that it can be either executed or rendered */
type SeedQuery = SQLWrapper & PromiseLike<unknown>;

export class SeedService {
	static readonly entityKind: string = 'SeedService';

	private defaultCountForTable = 10;
	private defaultBatchSize = 10000;
	private postgresPgLiteMaxParametersNumber = 32740;
	private postgresMaxParametersNumber = 65535;
	// there is no max parameters number in mysql, so you can increase mysqlMaxParametersNumber if it's needed.
	private mysqlMaxParametersNumber = 100000;
	//  SQLITE_MAX_VARIABLE_NUMBER, which by default equals to 999 for SQLite versions prior to 3.32.0 (2020-05-22) or 32766 for SQLite versions after 3.32.0.
	private sqliteMaxParametersNumber = 32766;
	private mssqlMaxParametersNumber = 2100;
	private version?: number;
	private hashFromStringGenerator: GenerateHashFromString | undefined;

	generatePossibleGenerators = (
		connectionType: ConnectionType,
		tables: Table[],
		relations: (Relation & { isCyclic: boolean })[],
		refinements?: RefinementsType,
		options?: { count?: number; seed?: number; version?: number },
	) => {
		let columnPossibleGenerator: Prettify<GeneratePossibleGeneratorsColumnType>;
		let tablePossibleGenerators: Prettify<GeneratePossibleGeneratorsTableType>;
		const customSeed = options?.seed === undefined ? 0 : options.seed;
		this.version = options?.version === undefined ? latestVersion : options.version;
		if (Number.isNaN(this.version) || this.version < 1 || this.version > latestVersion) {
			throw new Error(`Version should be in range [1, ${latestVersion}].`);
		}
		this.hashFromStringGenerator = this.selectVersionOfGenerator(
			new generatorsMap.GenerateHashFromString[0](),
		) as GenerateHashFromString;

		// sorting table in order which they will be filled up (tables with foreign keys case)
		const { tablesInOutRelations } = this.getInfoFromRelations(relations);
		const orderedTablesNames = this.getOrderedTablesList(tablesInOutRelations);
		tables = tables.sort((table1, table2) => {
			const rel = relations.find((rel) => rel.table === table1.name && rel.refTable === table2.name);

			if (rel?.isCyclic === true) {
				const reverseRel = relations.find((rel) => rel.table === table2.name && rel.refTable === table1.name);
				return this.cyclicTablesCompare(table1, table2, rel, reverseRel);
			}

			const table1Order = orderedTablesNames.indexOf(
					table1.name,
				),
				table2Order = orderedTablesNames.indexOf(
					table2.name,
				);
			return table1Order - table2Order;
		});

		const tableNamesSet = new Set(tables.map((table) => table.name));
		const tablesPossibleGenerators: Prettify<
			(typeof tablePossibleGenerators)[]
		> = tables.map((table) => ({
			tableName: table.name,
			columnsPossibleGenerators: [],
			withFromTable: {},
		}));

		for (const [i, table] of tables.entries()) {
			const compositeUniqueKeyGenMap: { [key: string]: GenerateCompositeUniqueKey } = {};
			// get foreignKey columns relations
			const foreignKeyColumns: {
				[columnName: string]: { table: string; column: string };
			} = {};

			for (
				const rel of relations
					.filter((rel) => rel.table === table.name)
			) {
				for (const [idx, col] of rel.columns.entries()) {
					foreignKeyColumns[col] = {
						table: rel.refTable,
						column: rel.refColumns[idx] as string,
					};
				}
			}

			// a composite primary key makes a column tuple distinct exactly like a composite unique constraint does, and a
			// junction table's primary key is usually just its two foreign keys - without generating it as a key, seeding
			// one violates it. Only a tuple made entirely of foreign key columns is treated this way: those are filled
			// from the values of the tables they point at, which distinct combinations can always be drawn from, while an
			// arbitrary column may have no way of producing unique values at all.
			for (const compositePrimaryKey of table.compositePrimaryKeys) {
				if (compositePrimaryKey.length < 2) continue;
				if (!compositePrimaryKey.every((columnName) => Object.hasOwn(foreignKeyColumns, columnName))) continue;
				// two keys sharing a column cannot both be generated, so an overlapping primary key gives way
				if (
					table.uniqueConstraints.some((constraint) =>
						constraint.some((columnName) => compositePrimaryKey.includes(columnName))
					)
				) continue;

				table.uniqueConstraints = [...table.uniqueConstraints, compositePrimaryKey];
			}

			// handling refinements (count, with)
			if (refinements !== undefined && refinements[table.name] !== undefined) {
				if (refinements[table.name]!.count !== undefined) {
					tablesPossibleGenerators[i]!.count = refinements[table.name]!.count;
				}

				if (refinements[table.name]!.with !== undefined) {
					tablesPossibleGenerators[i]!.count = refinements[table.name]!.count
						|| options?.count
						|| this.defaultCountForTable;
					let idx: number;
					for (
						const fkTableName of Object.keys(
							refinements[table.name]!.with as {},
						)
					) {
						if (!tablesInOutRelations[table.name]?.dependantTableNames.has(fkTableName)) {
							const reason = tablesInOutRelations[table.name]?.selfRelation === true
								? `"${table.name}" table has self reference`
								: `"${fkTableName}" table doesn't have a reference to "${table.name}" table or`
									+ `\nyou didn't include your one-to-many relation in the seed function schema`;
							throw new Error(
								`${reason}.` + `\nYou can't specify "${fkTableName}" as parameter in ${table.name}.with object.`
									+ `\n\nFor more details, check this: https://orm.drizzle.team/docs/guides/seeding-using-with-option`,
							);
						}

						idx = tablesPossibleGenerators.findIndex(
							(table) => table.tableName === fkTableName,
						);
						if (idx !== -1) {
							let newTableWithCount: number,
								weightedCountSeed: number | undefined;
							if (
								typeof refinements![table.name]!.with![fkTableName] === 'number'
							) {
								newTableWithCount = (tablesPossibleGenerators[i]!.withCount
									|| tablesPossibleGenerators[i]!.count)!
									* (refinements[table.name]!.with![fkTableName] as number);
							} else {
								const weightedRepeatedValuesCount = refinements[table.name]!
									.with![fkTableName] as {
										weight: number;
										count: number | number[];
									}[];

								weightedCountSeed = customSeed
									+ this.hashFromStringGenerator.generate({ input: `${table.name}.${fkTableName}` });

								newTableWithCount = this.getWeightedWithCount(
									weightedRepeatedValuesCount,
									(tablesPossibleGenerators[i]!.withCount
										|| tablesPossibleGenerators[i]!.count)!,
									weightedCountSeed,
								);
							}

							if (
								tablesPossibleGenerators[idx]!.withCount === undefined
								|| newTableWithCount > tablesPossibleGenerators[idx]!.withCount!
							) {
								tablesPossibleGenerators[idx]!.withCount = newTableWithCount;
							}

							tablesPossibleGenerators[idx]!.withFromTable[table.name] = {
								repeatedValuesCount: refinements[table.name]!.with![fkTableName]!,
								weightedCountSeed,
							};
						}
					}
				}
			}
			tablePossibleGenerators = tablesPossibleGenerators[i]!;
			for (const col of table.columns) {
				// col.myType = typeMap[col._type as keyof typeof typeMap];
				columnPossibleGenerator = {
					columnName: col.name,
					isUnique: col.isUnique,
					notNull: col.notNull,
					primary: col.primary,
					generatedIdentityType: col.generatedIdentityType,
					identity: col.identity,
					generator: undefined,
					isCyclic: false,
					wasDefinedBefore: false,
					wasRefined: false,
				};

				// handling refinements (columnGenerator)
				if (
					refinements !== undefined
					&& refinements[table.name] !== undefined
					&& refinements[table.name]!.columns !== undefined
					&& refinements[table.name]!.columns[col.name] !== undefined
				) {
					const genObj = refinements[table.name]!.columns[col.name]!;
					if (genObj === false) {
						if (col.notNull === true && col.hasDefault === false) {
							throw new Error(
								`You cannot set the '${col.name}' column in the '${table.name}' table to false in your refinements.`
									+ `\nDoing so will result in a null value being inserted into the '${col.name}' column,`
									+ `\nwhich will cause an error because the column has a not null constraint and no default value.`,
							);
						}

						// Generating undefined as a value for a column and then inserting it via drizzle-orm
						// will result in null of default value being inserted into that column.
						columnPossibleGenerator.generator = new generatorsMap.GenerateDefault[0]({ defaultValue: undefined });
						columnPossibleGenerator.wasRefined = true;

						continue;
					}

					if (
						(col.typeParams.dimensions && col.typeParams.dimensions > 1)
						|| (col.typeParams.dimensions !== undefined && col.typeParams.dimensions > 1)
					) {
						throw new Error("for now you can't specify generators for columns of dimension greater than 1.");
					}

					genObj.columnDataType = col.dataType;

					columnPossibleGenerator.generator = genObj;
					columnPossibleGenerator.wasRefined = true;
				} else if (Object.hasOwn(foreignKeyColumns, col.name)) {
					// TODO: I might need to assign repeatedValuesCount to column there instead of doing so in generateTablesValues
					const cyclicRelation = relations.find((rel) =>
						rel.table === table.name
						&& rel.isCyclic === true
						&& rel.columns.includes(col.name)
					);

					if (cyclicRelation !== undefined) {
						columnPossibleGenerator.isCyclic = true;
					}

					if (
						(foreignKeyColumns[col.name]?.table === undefined || !tableNamesSet.has(foreignKeyColumns[col.name]!.table))
						&& col.notNull === true
					) {
						throw new Error(
							`Column '${col.name}' has not null contraint,`
								+ `\nand you didn't specify a table for foreign key on column '${col.name}' in '${table.name}' table.`
								+ `\n\nFor more details, check this: https://orm.drizzle.team/docs/guides/seeding-with-partially-exposed-tables#example-1`,
						);
					}

					const predicate = (
						cyclicRelation !== undefined
						|| (
							foreignKeyColumns[col.name]?.table === undefined
							|| !tableNamesSet.has(foreignKeyColumns[col.name]!.table)
						)
					)
						&& col.notNull === false;
					// TODO: revise this part
					if (predicate === true) {
						if (
							(foreignKeyColumns[col.name]?.table === undefined
								|| !tableNamesSet.has(foreignKeyColumns[col.name]!.table)) && col.notNull === false
						) {
							console.warn(
								`Column '${col.name}' in '${table.name}' table will be filled with Null values`
									+ `\nbecause you specified neither a table for foreign key on column '${col.name}'`
									+ `\nnor a function for '${col.name}' column in refinements.`
									+ `\n\nFor more details, check this: https://orm.drizzle.team/docs/guides/seeding-with-partially-exposed-tables#example-2`,
							);
						}
						columnPossibleGenerator.generator = new generatorsMap.GenerateValuesFromArray[0]({ values: [null] });
						columnPossibleGenerator.wasDefinedBefore = true;
					} else {
						// self relation
						if (foreignKeyColumns[col.name]!.table === table.name) {
							columnPossibleGenerator.generator = new generatorsMap.GenerateSelfRelationsValuesFromArray[0]();
						} else columnPossibleGenerator.generator = new generatorsMap.GenerateValuesFromArray[0]();
					}
				} // TODO: rewrite pickGeneratorFor... using new col properties: isUnique and notNull
				else if (connectionType === 'postgresql') {
					columnPossibleGenerator.generator = selectGeneratorForPostgresColumn(
						col,
						table.primaryKeys.includes(col.name),
					);
				} else if (connectionType === 'mysql') {
					columnPossibleGenerator.generator = selectGeneratorForMysqlColumn(table, col);
				} else if (connectionType === 'sqlite') {
					columnPossibleGenerator.generator = selectGeneratorForSqlite(table, col);
				} else if (connectionType === 'mssql') {
					columnPossibleGenerator.generator = selectGeneratorForMssqlColumn(table, col);
				} else if (connectionType === 'cockroach') {
					columnPossibleGenerator.generator = selectGeneratorForCockroachColumn(table, col);
				} else if (connectionType === 'singlestore') {
					columnPossibleGenerator.generator = selectGeneratorForSingleStoreColumn(table, col);
				}

				if (columnPossibleGenerator.generator === undefined) {
					throw new Error(
						`column with type ${col.columnType} is not supported for now.`,
					);
				}

				columnPossibleGenerator.generator.typeParams = col.typeParams ?? columnPossibleGenerator.generator.typeParams;
				const arrayGen = columnPossibleGenerator.generator.replaceIfArray();
				if (arrayGen !== undefined) {
					columnPossibleGenerator.generator = arrayGen;
				}

				// `col.isUnique` only reflects an inline `.unique()` modifier, so a column that is a primary key on its own
				// has to be marked unique here as well - otherwise one filled from a relation samples the values it
				// points at with repetition and violates its own primary key. A generator the user picked themselves is
				// left alone: they are the ones who said what it should do.
				const isSingleColumnPrimaryKey = col.primary
					|| table.compositePrimaryKeys.some((primaryKey) => primaryKey.length === 1 && primaryKey[0] === col.name);
				columnPossibleGenerator.generator.isUnique = col.isUnique
					|| (isSingleColumnPrimaryKey && columnPossibleGenerator.wasRefined === false);

				// composite unique keys handling
				let compositeKeyColumnNames = table.uniqueConstraints.filter((colNames) => colNames.includes(col.name));
				if (compositeKeyColumnNames.some((colNames) => colNames.length === 1)) {
					// composite unique key contains only one column, therefore it equals to just unique column
					columnPossibleGenerator.generator.isUnique = true;
				}

				// removing column from composite unique keys if current column is unique
				if (columnPossibleGenerator.generator.isUnique && compositeKeyColumnNames.length > 0) {
					const newUniqueConstraints: string[][] = [];
					for (const colNames of table.uniqueConstraints) {
						if (colNames.includes(col.name)) {
							const newColNames = colNames.filter((colName) => colName !== col.name);
							if (newColNames.length === 0) continue;
							newUniqueConstraints.push(newColNames);
						} else {
							newUniqueConstraints.push(colNames);
						}
					}

					table.uniqueConstraints = newUniqueConstraints;
				}

				compositeKeyColumnNames = table.uniqueConstraints.filter((colNames) => colNames.includes(col.name));
				if (compositeKeyColumnNames.length > 1) {
					throw new Error('Currently, multiple composite unique keys that share the same column are not supported.');
				}

				// to handle composite unique key generation, I will need a unique generator for each column in the composite key
				if (compositeKeyColumnNames.length === 1) {
					// params.isUnique = false can only be set by the user; by default, it is undefined
					if (columnPossibleGenerator.generator.params.isUnique === false) {
						throw new Error(
							`To handle the composite unique key on columns: ${compositeKeyColumnNames[0]}, `
								+ `column: ${col.name} should either be assigned a generator with isUnique set to true, or have isUnique omitted.`,
						);
					}
					columnPossibleGenerator.generator.params.isUnique = true;
				}

				const uniqueGen = columnPossibleGenerator.generator.replaceIfUnique();
				if (uniqueGen !== undefined) {
					columnPossibleGenerator.generator = uniqueGen;
				}

				if (
					compositeKeyColumnNames.length === 1 && !columnPossibleGenerator.generator.isGeneratorUnique
					&& !(columnPossibleGenerator.generator.getEntityKind() === 'GenerateValuesFromArray')
				) {
					throw new Error(
						`To handle the composite unique key on columns: ${compositeKeyColumnNames[0]}, `
							+ `column: ${col.name} should be assigned a generator with its own unique version.`,
					);
				}

				// selecting version of generator
				columnPossibleGenerator.generator = this.selectVersionOfGenerator(columnPossibleGenerator.generator);

				// TODO: for now only GenerateValuesFromArray support notNull property
				columnPossibleGenerator.generator.notNull = col.notNull;
				columnPossibleGenerator.generator.dataType = col.dataType;

				// assigning composite key generator
				if (compositeKeyColumnNames.length === 1) {
					const key = compositeKeyColumnNames[0]!.join('_');
					if (compositeUniqueKeyGenMap[key] === undefined) {
						let compositeUniqueKeyGen = new generatorsMap.GenerateCompositeUniqueKey[0]();
						compositeUniqueKeyGen.uniqueKey = key;
						compositeUniqueKeyGen = this.selectVersionOfGenerator(compositeUniqueKeyGen) as GenerateCompositeUniqueKey;
						compositeUniqueKeyGenMap[key] = compositeUniqueKeyGen;
					}

					compositeUniqueKeyGenMap[key].addGenerator(col.name, columnPossibleGenerator.generator);
					columnPossibleGenerator.generator = compositeUniqueKeyGenMap[key];
				}

				tablePossibleGenerators.columnsPossibleGenerators.push(
					columnPossibleGenerator,
				);
			}
		}

		return tablesPossibleGenerators;
	};

	selectVersionOfGenerator = (generator: AbstractGenerator<any>) => {
		const entityKind = generator.getEntityKind();
		if (entityKind === 'GenerateArray') {
			const oldBaseColumnGen = (generator as GenerateArray).params.baseColumnGen;

			const newBaseColumnGen = this.selectVersionOfGenerator(oldBaseColumnGen);
			newBaseColumnGen.typeParams = oldBaseColumnGen.typeParams;

			(generator as GenerateArray).params.baseColumnGen = newBaseColumnGen;
		}

		if (entityKind === 'WeightedRandomGenerator') {
			for (const param of (generator as WeightedRandomGenerator).params) {
				param.value = this.selectVersionOfGenerator(param.value);
			}
		}

		const possibleGeneratorConstructors = generatorsMap[entityKind as keyof typeof generatorsMap];

		const possibleGeneratorConstructorsFiltered = possibleGeneratorConstructors?.filter((possGenCon) =>
			possGenCon.version <= this.version! // sorting in ascending order by version
		).sort((a, b) => a.version - b.version);
		const generatorConstructor = possibleGeneratorConstructorsFiltered?.at(-1) as
			| (new(params: any) => AbstractGenerator<any>)
			| undefined;
		if (generatorConstructor === undefined) {
			throw new Error(`Can't select ${entityKind} generator for ${this.version} version.`);
		}

		const newGenerator = new generatorConstructor(generator.params);
		newGenerator.columnDataType = generator.columnDataType;
		newGenerator.isUnique = generator.isUnique;
		// TODO: for now only GenerateValuesFromArray support notNull property
		newGenerator.notNull = generator.notNull;
		newGenerator.dataType = generator.dataType;
		// newGenerator.stringLength = generator.stringLength;
		newGenerator.typeParams = generator.typeParams ?? newGenerator.typeParams;
		newGenerator.uniqueKey = generator.uniqueKey;

		return newGenerator;
	};

	cyclicTablesCompare = (
		table1: Table,
		table2: Table,
		relation: Relation & { isCyclic: boolean },
		reverseRelation: Relation & { isCyclic: boolean } | undefined,
	) => {
		// TODO: revise
		const hasTable1NotNullColumns = relation.columns.some((colIName) =>
			table1.columns.find((colJ) => colJ.name === colIName)?.notNull === true
		);

		if (reverseRelation !== undefined) {
			const hasTable2NotNullColumns = reverseRelation.columns.some((colIName) =>
				table2.columns.find((colJ) => colJ.name === colIName)?.notNull === true
			);

			if (hasTable1NotNullColumns && hasTable2NotNullColumns) {
				throw new Error(
					`The '${table1.name}' and '${table2.name}' tables have not null foreign keys. You can't seed cyclic tables with not null foreign key columns.`,
				);
			}

			if (hasTable1NotNullColumns) return 1;
			else if (hasTable2NotNullColumns) return -1;
			return 0;
		}

		if (hasTable1NotNullColumns) {
			return 1;
		}
		return 0;

		// if (hasTable1NotNullColumns) return 1;
		// else if (hasTable2NotNullColumns) return -1;
	};

	getOrderedTablesList = (
		tablesInOutRelations: ReturnType<typeof this.getInfoFromRelations>['tablesInOutRelations'],
	): string[] => {
		const leafTablesNames = Object.entries(tablesInOutRelations)
			.filter(
				(tableRel) =>
					tableRel[1].out === 0
					|| (tableRel[1].out !== 0
						&& tableRel[1].selfRelCount === tableRel[1].out),
			)
			.map((tableRel) => tableRel[0]);

		const orderedTablesNames: string[] = [];
		let parent: string, children: string[];
		for (let i = 0; leafTablesNames.length !== 0; i++) {
			parent = leafTablesNames.shift() as string;

			if (orderedTablesNames.includes(parent)) {
				continue;
			}

			if (tablesInOutRelations[parent] === undefined) {
				orderedTablesNames.push(parent);
				continue;
			}

			for (const orderedTableName of orderedTablesNames) {
				tablesInOutRelations[parent]!.requiredTableNames.delete(orderedTableName);
			}

			if (
				tablesInOutRelations[parent]!.requiredTableNames.size === 0
				|| equalSets(
					tablesInOutRelations[parent]!.requiredTableNames,
					tablesInOutRelations[parent]!.dependantTableNames,
				)
			) {
				orderedTablesNames.push(parent);
			} else {
				leafTablesNames.push(...tablesInOutRelations[parent]!.requiredTableNames, parent);
				continue;
			}

			children = [...tablesInOutRelations[parent]!.dependantTableNames];
			leafTablesNames.push(...children);
		}
		return orderedTablesNames;
	};

	getInfoFromRelations = (relations: (Relation & { isCyclic: boolean })[]) => {
		const tablesInOutRelations: {
			[tableName: string]: {
				out: number;
				in: number;
				selfRelation: boolean;
				selfRelCount: number;
				requiredTableNames: Set<string>;
				dependantTableNames: Set<string>;
			};
		} = {};

		// const cyclicRelations: { [cyclicTableName: string]: Relation & { isCyclic: boolean } } = {};

		for (const rel of relations) {
			// if (rel.isCyclic) {
			// 	cyclicRelations[rel.table] = rel;
			// }

			if (tablesInOutRelations[rel.table] === undefined) {
				tablesInOutRelations[rel.table] = {
					out: 0,
					in: 0,
					selfRelation: false,
					selfRelCount: 0,
					requiredTableNames: new Set(),
					dependantTableNames: new Set(),
				};
			}

			if (
				rel.refTable !== undefined
				&& tablesInOutRelations[rel.refTable] === undefined
			) {
				tablesInOutRelations[rel.refTable] = {
					out: 0,
					in: 0,
					selfRelation: false,
					selfRelCount: 0,
					requiredTableNames: new Set(),
					dependantTableNames: new Set(),
				};
			}

			if (rel.refTable !== undefined) {
				tablesInOutRelations[rel.table]!.out += 1;
				tablesInOutRelations[rel.refTable]!.in += 1;
			}

			if (rel.refTable === rel.table) {
				tablesInOutRelations[rel.table]!.selfRelation = true;
				tablesInOutRelations[rel.table]!.selfRelCount = rel.columns.length;
			} else if (rel.refTable !== undefined) {
				tablesInOutRelations[rel.table]!.requiredTableNames.add(rel.refTable);
				tablesInOutRelations[rel.refTable]!.dependantTableNames.add(rel.table);
			}
		}

		return { tablesInOutRelations };
	};

	getWeightedWithCount = (
		weightedCount: { weight: number; count: number | number[] }[],
		count: number,
		seed: number,
	) => {
		let gen = new generatorsMap.GenerateWeightedCount[0]();
		gen = this.selectVersionOfGenerator(gen) as GenerateWeightedCount;
		// const gen = new GenerateWeightedCount({});
		gen.init({ count: weightedCount, seed });
		let weightedWithCount = 0;
		for (let i = 0; i < count; i++) {
			weightedWithCount += gen.generate();
		}

		return weightedWithCount;
	};

	filterCyclicTables = (tablesGenerators: ReturnType<typeof this.generatePossibleGenerators>) => {
		const filteredTablesGenerators = tablesGenerators.filter((tableGen) =>
			tableGen.columnsPossibleGenerators.some((columnGen) =>
				columnGen.isCyclic === true && columnGen.wasDefinedBefore === true
			)
		);

		const tablesUniqueNotNullColumn: { [tableName: string]: { uniqueNotNullColName: string } } = {};

		for (const [idx, tableGen] of filteredTablesGenerators.entries()) {
			const uniqueNotNullColName = filteredTablesGenerators[idx]!.columnsPossibleGenerators.find((colGen) =>
				colGen.primary === true
				|| (colGen.isUnique === true
					&& colGen.notNull === true)
			)?.columnName;
			if (uniqueNotNullColName === undefined) {
				throw new Error(
					`Table '${tableGen.tableName}' does not have primary or (unique and notNull) column. Can't seed table with cyclic relation.`,
				);
			}
			tablesUniqueNotNullColumn[tableGen.tableName] = { uniqueNotNullColName };

			filteredTablesGenerators[idx]!.columnsPossibleGenerators = tableGen.columnsPossibleGenerators.filter((
				colGen,
			) => (colGen.isCyclic === true && colGen.wasDefinedBefore === true) || colGen.columnName === uniqueNotNullColName)
				.map((colGen) => {
					const newColGen = { ...colGen };
					newColGen.wasDefinedBefore = false;
					return newColGen;
				});
		}

		return { filteredTablesGenerators, tablesUniqueNotNullColumn };
	};

	/**
	 * Produces every write a seed is made of, in the order it has to happen, without performing any of them. Rows come
	 * out a batch at a time, so a caller that does not hold on to them never has more than one batch of a table in
	 * memory - which is what makes seeding millions of rows possible whichever sink the operations end up in.
	 */
	*planSeed(
		{ connectionType, tables, relations, refinements, options, maxParametersNumber }: {
			connectionType: ConnectionType;
			tables: Table[];
			relations: (Relation & { isCyclic: boolean })[];
			refinements?: RefinementsType;
			options?: { count?: number; seed?: number; version?: number };
			maxParametersNumber: number;
		},
	): Generator<SeedOperation> {
		const tablesGenerators = this.generatePossibleGenerators(
			connectionType,
			tables,
			relations,
			refinements,
			options,
		);

		// only postgres needs its sequences moved past the values that were written explicitly; mysql and sqlite keep
		// their auto increment counters in step on their own
		const sequenceColumns: { [tableName: string]: Set<string> } = {};
		if (connectionType === 'postgresql') {
			for (const table of tables) {
				sequenceColumns[table.name] = new Set(
					table.columns.filter((column) => isSequenceBackedColumn(column)).map((column) => column.name),
				);
			}
		}

		const tablesValues: { tableName: string; rows: GeneratedRow[] }[] = [];

		yield* this.planTablesValues({
			relations,
			tablesGenerators,
			tablesValues,
			sequenceColumns,
			options,
			maxParametersNumber,
			preserveCyclicTablesData: relations.some((rel) => rel.isCyclic === true),
		});

		// tables held together by a cyclic relation cannot be filled in one go: the pass above leaves the cyclic foreign
		// keys null, and this one fills them in now that both sides exist.
		const { filteredTablesGenerators, tablesUniqueNotNullColumn } = this.filterCyclicTables(tablesGenerators);
		if (filteredTablesGenerators.length !== 0) {
			yield* this.planTablesValues({
				relations,
				tablesGenerators: filteredTablesGenerators,
				tablesValues,
				sequenceColumns,
				options,
				maxParametersNumber,
				tablesUniqueNotNullColumn,
			});
		}
	}

	private *planTablesValues(
		{
			relations,
			tablesGenerators,
			tablesValues,
			sequenceColumns,
			options,
			maxParametersNumber,
			tablesUniqueNotNullColumn,
			preserveCyclicTablesData,
		}: {
			relations: (Relation & { isCyclic: boolean })[];
			tablesGenerators: Prettify<GeneratePossibleGeneratorsTableType>[];
			tablesValues: { tableName: string; rows: GeneratedRow[] }[];
			sequenceColumns: { [tableName: string]: Set<string> };
			options?: { count?: number; seed?: number };
			maxParametersNumber: number;
			tablesUniqueNotNullColumn?: { [tableName: string]: { uniqueNotNullColName: string } };
			preserveCyclicTablesData?: boolean;
		},
	): Generator<SeedOperation> {
		const customSeed = options?.seed === undefined ? 0 : options.seed;
		// the second pass over cyclic tables rewrites rows that already exist instead of adding new ones
		const isUpdatePass = tablesUniqueNotNullColumn !== undefined;

		let tableCount: number | undefined;
		let columnsGenerators: Prettify<GeneratePossibleGeneratorsColumnType>[];
		let tableGenerators: Prettify<TableGeneratorsType>;
		let pRNGSeed: number;
		let filteredRelations: typeof relations;

		// TODO: now I'm generating tablesInOutRelations twice, first time in generatePossibleGenerators and second time here. maybe should generate it once instead.
		const { tablesInOutRelations } = this.getInfoFromRelations(relations);
		for (const table of tablesGenerators) {
			tableCount = table.count === undefined ? options?.count || this.defaultCountForTable : table.count;

			tableGenerators = {};
			columnsGenerators = table.columnsPossibleGenerators;

			filteredRelations = relations.filter(
				(rel) => rel.table === table.tableName,
			);

			// adding pRNG seed to column
			for (const col of columnsGenerators) {
				const columnRelations = filteredRelations.filter((rel) => rel.columns.includes(col.columnName));
				pRNGSeed = (columnRelations.length !== 0
						&& columnRelations[0]!.columns.length >= 2)
					? (customSeed
						+ this.hashFromStringGenerator!.generate({
							input: `${columnRelations[0]!.table}.${columnRelations[0]!.columns.join('_')}`,
						}))
					: col.generator?.uniqueKey === undefined
					? (customSeed + this.hashFromStringGenerator!.generate({ input: `${table.tableName}.${col.columnName}` }))
					: (customSeed + this.hashFromStringGenerator!.generate({ input: col.generator.uniqueKey }));

				tableGenerators[col.columnName] = {
					pRNGSeed,
					...col,
				};
			}

			// get values to generate columns with foreign key

			// if table posts contains foreign key to table users, then rel.table === 'posts' and rel.refTable === 'users',
			// because table posts has reference to table users.
			if (filteredRelations.length !== 0) {
				for (const rel of filteredRelations) {
					if (
						table.withFromTable[rel.refTable] !== undefined
						&& table.withCount !== undefined
					) {
						tableCount = table.withCount;
					}

					for (let colIdx = 0; colIdx < rel.columns.length; colIdx++) {
						let refColumnValues: GeneratedValueType[];
						let hasSelfRelation: boolean = false;
						let repeatedValuesCount:
								| number
								| { weight: number; count: number | number[] }[]
								| undefined,
							weightedCountSeed: number | undefined;
						let genObj: AbstractGenerator<any> | undefined;

						if (
							rel.table === rel.refTable
							&& tableGenerators[rel.columns[colIdx]!]?.wasRefined === false
						) {
							const refColName = rel.refColumns[colIdx] as string;
							pRNGSeed = this.hashFromStringGenerator!.generate({
								input: `${table.tableName}.${refColName}`,
							});

							const refColumnGenerator: typeof tableGenerators = {};
							refColumnGenerator[refColName] = {
								...tableGenerators[refColName]!,
								pRNGSeed,
							};

							// a self relation draws its values from the very column it points at, so that column is
							// generated once up front and then sampled
							refColumnValues = [];
							for (
								const batch of this.generateRowBatches({
									tableGenerators: refColumnGenerator,
									count: tableCount,
									batchSize: Math.max(1, tableCount ?? this.defaultCountForTable),
								})
							) {
								for (const row of batch) refColumnValues.push(row[refColName]);
							}

							hasSelfRelation = true;
							genObj = tableGenerators[rel.columns[colIdx]!]!.generator!;
							genObj.updateParams({ columnName: rel.columns[colIdx]!, paramsToUpdate: { values: refColumnValues } });
						} else if (
							tableGenerators[rel.columns[colIdx]!]?.wasDefinedBefore === false
							&& tableGenerators[rel.columns[colIdx]!]?.wasRefined === false
						) {
							refColumnValues = tablesValues
								.find((val) => val.tableName === rel.refTable)!
								.rows!.map((row) => row[rel.refColumns[colIdx]!]!);

							if (
								table.withFromTable[rel.refTable] !== undefined
								&& table.withFromTable[rel.refTable]!.repeatedValuesCount
									!== undefined
							) {
								repeatedValuesCount = table.withFromTable[rel.refTable]!.repeatedValuesCount;
								weightedCountSeed = table.withFromTable[rel.refTable]!.weightedCountSeed;
							}

							// TODO: revise maybe need to select version of generator here too
							genObj = tableGenerators[rel.columns[colIdx]!]!.generator!;
							genObj.updateParams({ columnName: rel.columns[colIdx]!, paramsToUpdate: { values: refColumnValues } });

							// a column that is part of a composite unique key is generated together with the rest of the
							// key, by walking the combinations of their values - which cannot also honour how many times
							// each referenced value is meant to repeat
							if (
								repeatedValuesCount !== undefined
								&& genObj.getEntityKind() === 'GenerateCompositeUniqueKey'
							) {
								console.warn(
									`Column '${rel.columns[colIdx]}' of the '${table.tableName}' table is part of a composite`
										+ ` unique key, so the number of rows per '${rel.refTable}' row asked for in the 'with'`
										+ ` option cannot be applied to it.`,
								);
							}

							genObj.notNull = tableGenerators[rel.columns[colIdx]!]!.notNull;
							genObj.weightedCountSeed = weightedCountSeed;
							genObj.maxRepeatedValuesCount = repeatedValuesCount;
						}

						if (genObj !== undefined) {
							tableGenerators[rel.columns[colIdx]!]!.generator = genObj;
						}
						tableGenerators[rel.columns[colIdx]!] = {
							...tableGenerators[rel.columns[colIdx]!]!,
							hasSelfRelation,
							hasRelation: true,
						};
					}
				}
			}

			// a table's rows are only kept around while a table that still has to be generated needs them to fill in a
			// foreign key
			let preserveData = tablesInOutRelations[table.tableName]?.in !== 0;
			preserveData = preserveData || (preserveCyclicTablesData === true
				&& table.columnsPossibleGenerators.some((colGen) => colGen.isCyclic === true));

			let override = false;
			let columnsNumber = 0;
			for (const columnName of Object.keys(tableGenerators)) {
				columnsNumber += 1;
				// postgres identity columns
				override = tableGenerators[columnName]?.generatedIdentityType === 'always' ? true : override;
				// mssql identity columns
				override = tableGenerators[columnName]?.identity === true ? true : override;
			}

			// a statement carries one parameter per column of every row it writes, so how many rows fit in one depends
			// on how wide the table is
			const maxBatchSize = Math.max(1, Math.floor(maxParametersNumber / Math.max(1, columnsNumber)));
			const batchSize = isUpdatePass ? 1 : Math.min(this.defaultBatchSize, maxBatchSize);

			const uniqueNotNullColName = tablesUniqueNotNullColumn?.[table.tableName]?.uniqueNotNullColName;
			const trackedColumns = isUpdatePass ? undefined : sequenceColumns[table.tableName];
			const maxSequenceValues = new Map<string, number | bigint>();

			const retainedRows: GeneratedRow[] = [];
			for (
				const batch of this.generateRowBatches({
					tableGenerators,
					count: tableCount,
					batchSize,
					trackedColumns,
					maxTrackedValues: maxSequenceValues,
				})
			) {
				if (isUpdatePass) {
					for (const row of batch) {
						const values = { ...row };
						delete values[uniqueNotNullColName as string];

						yield {
							type: 'update',
							tableName: table.tableName,
							values,
							whereColumn: uniqueNotNullColName as string,
							whereValue: row[uniqueNotNullColName as string],
						};
					}
				} else {
					yield { type: 'insert', tableName: table.tableName, rows: batch, override };
				}

				if (preserveData === true) retainedRows.push(...batch);
			}

			for (const [columnName, value] of maxSequenceValues) {
				yield { type: 'sequence', tableName: table.tableName, columnName, value };
			}

			if (preserveData === true) {
				tablesValues.push({
					tableName: table.tableName,
					rows: retainedRows,
				});
			}

			// removing "link" from table that was required to generate current table
			if (tablesInOutRelations[table.tableName] !== undefined) {
				for (const tableName of tablesInOutRelations[table.tableName]!.requiredTableNames) {
					tablesInOutRelations[tableName]!.in -= 1;
				}
			}

			if (preserveData === false) {
				// drop the rows of tables nothing is waiting on any more
				const stillNeeded = tablesValues.filter(
					(table) =>
						tablesInOutRelations[table.tableName] !== undefined && tablesInOutRelations[table.tableName]!.in > 0,
				);
				tablesValues.length = 0;
				tablesValues.push(...stillNeeded);
			}
		}
	}

	private *generateRowBatches(
		{ tableGenerators, count, batchSize, trackedColumns, maxTrackedValues }: {
			tableGenerators: Prettify<TableGeneratorsType>;
			count?: number;
			batchSize: number;
			trackedColumns?: Set<string>;
			maxTrackedValues?: Map<string, number | bigint>;
		},
	): Generator<GeneratedRow[]> {
		const rowCount = count === undefined ? this.defaultCountForTable : count;

		const columnsGenerators: { [columnName: string]: AbstractGenerator<any> } = {};
		for (const columnName of Object.keys(tableGenerators)) {
			const columnGenerator = tableGenerators[columnName]!;

			columnsGenerators[columnName] = columnGenerator.generator!;
			columnsGenerators[columnName]!.init({
				count: rowCount,
				seed: columnGenerator.pRNGSeed,
			});
		}

		let batch: GeneratedRow[] = [];
		for (let i = 0; i < rowCount; i++) {
			const row: GeneratedRow = {};

			for (const columnName of Object.keys(columnsGenerators)) {
				const generatedValue = columnsGenerators[columnName]!.generate({ i, columnName }) as GeneratedValueType;
				row[columnName] = generatedValue;

				if (trackedColumns?.has(columnName) === true && generatedValue !== null && generatedValue !== undefined) {
					const currentMax = maxTrackedValues!.get(columnName);
					maxTrackedValues!.set(
						columnName,
						currentMax === undefined
							? generatedValue as number | bigint
							: intMax([currentMax, generatedValue as number | bigint]),
					);
				}
			}

			batch.push(row);

			if (batch.length === batchSize || i === rowCount - 1) {
				yield batch;
				batch = [];
			}
		}
	}

	/**
	 * The maximum number of parameters one statement may carry. MsSql's limit is used for the dialects whose own limit
	 * has never been established - a batch that is smaller than it could be only costs round trips.
	 */
	getMaxParametersNumber = (connectionType: ConnectionType, db?: DbType) => {
		if (connectionType === 'postgresql') {
			// @ts-ignore
			return db !== undefined && db.constructor[entityKind] === 'PgliteDatabase'
				? this.postgresPgLiteMaxParametersNumber
				: this.postgresMaxParametersNumber;
		}
		if (connectionType === 'mysql') return this.mysqlMaxParametersNumber;
		if (connectionType === 'sqlite') return this.sqliteMaxParametersNumber;

		return this.mssqlMaxParametersNumber;
	};

	/** Runs a seed by performing every operation of its plan against the database. */
	runSeed = async (
		{ connectionType, tables, relations, refinements, options, db, schema }: {
			connectionType: ConnectionType;
			tables: Table[];
			relations: (Relation & { isCyclic: boolean })[];
			refinements?: RefinementsType;
			options?: { count?: number; seed?: number; version?: number };
			db: DbType;
			schema: { [key: string]: TableType };
		},
	) => {
		const plan = this.planSeed({
			connectionType,
			tables,
			relations,
			refinements,
			options,
			maxParametersNumber: this.getMaxParametersNumber(connectionType, db),
		});

		for (const operation of plan) {
			if (operation.type === 'insert') {
				await this.insertInDb({ ...operation, db, schema });
			} else if (operation.type === 'update') {
				await this.updateDb({ ...operation, db, schema });
			} else {
				await this.updateColumnSequence({ ...operation, db, schema });
			}
		}
	};

	/**
	 * Folds a plan into the rows each table ends up holding, applying the second pass over cyclic tables to the rows the
	 * first one produced rather than to the database.
	 */
	collectSeedRows = (plan: Iterable<SeedOperation>, tableNames?: string[]) => {
		const tablesRows = new Map<string, GeneratedRow[]>();
		const rowsByKey = new Map<string, Map<string, GeneratedRow[]>>();

		for (const operation of plan) {
			if (operation.type === 'insert') {
				const rows = tablesRows.get(operation.tableName);
				if (rows === undefined) tablesRows.set(operation.tableName, [...operation.rows]);
				else rows.push(...operation.rows);
			} else if (operation.type === 'update') {
				const rows = tablesRows.get(operation.tableName) ?? [];

				let index = rowsByKey.get(operation.tableName);
				if (index === undefined) {
					// the update matches on a value, not on identity, exactly like the statement it stands in for
					index = new Map();
					for (const row of rows) {
						const key = this.valueKey(row[operation.whereColumn]);
						const matching = index.get(key);
						if (matching === undefined) index.set(key, [row]);
						else matching.push(row);
					}
					rowsByKey.set(operation.tableName, index);
				}

				for (const row of index.get(this.valueKey(operation.whereValue)) ?? []) {
					Object.assign(row, operation.values);
				}
			}
		}

		// a table nothing was generated for is still part of the result, it is simply empty. Tables that do have rows
		// keep the order they were generated in, which is an order they can be written back in.
		for (const tableName of tableNames ?? []) {
			if (!tablesRows.has(tableName)) tablesRows.set(tableName, []);
		}

		return tablesRows;
	};

	private valueKey = (value: GeneratedValueType) => {
		if (typeof value === 'bigint') return `bigint:${value}`;
		if (value instanceof Date) return `date:${value.getTime()}`;
		if (value instanceof Uint8Array) return `bytes:${Buffer.from(value).toString('base64')}`;

		return `${typeof value}:${String(value)}`;
	};

	/**
	 * The statements below are built once and then either awaited or rendered, so what `dryRun({ output: 'sql' })`
	 * prints is by construction the same statement a seed would run.
	 */
	buildInsertQuery = (
		{ rows, db, schema, tableName, override }: {
			rows: GeneratedRow[];
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			override: boolean;
		},
	): SeedQuery => {
		if (is(db, PgAsyncDatabase<any>)) {
			const query = db.insert((schema as { [key: string]: PgTable })[tableName]!);

			return override === true ? query.overridingSystemValue().values(rows) : query.values(rows);
		} else if (is(db, MySqlAsyncDatabase<any, any>)) {
			return db.insert((schema as { [key: string]: MySqlTable })[tableName]!).values(rows);
		} else if (is(db, SQLiteAsyncDatabase<any, any>)) {
			return db.insert((schema as { [key: string]: SQLiteTable })[tableName]!).values(rows);
		} else if (is(db, MsSqlDatabase<any, any>)) {
			return db.insert((schema as { [key: string]: MsSqlTable })[tableName]!).values(rows);
		} else if (is(db, CockroachDatabase<any, any>)) {
			return db.insert((schema as { [key: string]: CockroachTable })[tableName]!).values(rows);
		}

		return (db as SingleStoreDatabase<any, any>).insert((schema as { [key: string]: SingleStoreTable })[tableName]!)
			.values(rows);
	};

	/** MsSql refuses an explicit write to an identity column unless it is told to allow it around the statement. */
	buildIdentityInsertSql = (
		{ db, schema, tableName, enabled }: {
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			enabled: boolean;
		},
	) => {
		if (!is(db, MsSqlDatabase<any, any>)) return;

		const tableConfig = getTableConfigMsSql(schema[tableName]! as MsSqlTable);

		return `SET IDENTITY_INSERT [${tableConfig.schema ?? 'dbo'}].[${tableConfig.name}] ${enabled ? 'ON' : 'OFF'}`;
	};

	buildUpdateQuery = (
		{ values, db, schema, tableName, whereColumn, whereValue }: {
			values: GeneratedRow;
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			whereColumn: string;
			whereValue: GeneratedValueType;
		},
	): SeedQuery => {
		// every dialect spells this the same way, only the type of the database object differs
		const table = schema[tableName] as PgTableWithColumns<any>;

		return (db as PgAsyncDatabase<any>).update(table).set(values).where(eq(table[whereColumn], whereValue));
	};

	buildSequenceSql = (
		{ db, schema, tableName, columnName, value }: {
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			columnName: string;
			value: number | bigint;
		},
	) => {
		if (!is(db, PgAsyncDatabase)) return;

		const table = schema[tableName] as PgTableWithColumns<any> | undefined;
		const column = table?.[columnName];
		if (table === undefined || column === undefined) return;

		const dialect = (<any> db).dialect as PgDialect;
		const fullTableName = dialect.sqlToQuery(sql`${table}`).sql;
		const dbColumnName = dialect.sqlToQuery(sql`${column}`).sql.replace(`${fullTableName}.`, '').replaceAll('"', '');

		return `SELECT setval(pg_get_serial_sequence('${fullTableName}', '${dbColumnName}'), ${value.toString()}, true)`;
	};

	updateColumnSequence = async (
		{ db, schema, tableName, columnName, value }: {
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			columnName: string;
			value: number | bigint;
		},
	) => {
		const query = this.buildSequenceSql({ db, schema, tableName, columnName, value });
		// mysql updates auto_increment or serial columns by itself, and so does sqlite for autoincrement
		if (query === undefined) return;

		await (db as PgAsyncDatabase<any>).execute(query);
	};

	insertInDb = async (
		{ rows, db, schema, tableName, override }: {
			rows: GeneratedRow[];
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			override: boolean;
		},
	) => {
		const identityInsertOn = override === true
			? this.buildIdentityInsertSql({ db, schema, tableName, enabled: true })
			: undefined;
		if (identityInsertOn !== undefined) await (db as MsSqlDatabase<any, any>).execute(sql.raw(identityInsertOn));

		await this.buildInsertQuery({ rows, db, schema, tableName, override });

		const identityInsertOff = override === true
			? this.buildIdentityInsertSql({ db, schema, tableName, enabled: false })
			: undefined;
		if (identityInsertOff !== undefined) await (db as MsSqlDatabase<any, any>).execute(sql.raw(identityInsertOff));
	};

	updateDb = async (
		{ values, db, schema, tableName, whereColumn, whereValue }: {
			values: GeneratedRow;
			db: DbType;
			schema: { [key: string]: TableType };
			tableName: string;
			whereColumn: string;
			whereValue: GeneratedValueType;
		},
	) => {
		await this.buildUpdateQuery({ values, db, schema, tableName, whereColumn, whereValue });
	};
}
