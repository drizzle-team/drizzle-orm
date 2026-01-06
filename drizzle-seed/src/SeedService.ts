/* eslint-disable drizzle-internal/require-entity-kind */
import { entityKind, eq, is, sql } from 'drizzle-orm';
import type { MySqlTable, MySqlTableWithColumns } from 'drizzle-orm/mysql-core';
import { MySqlDatabase } from 'drizzle-orm/mysql-core';
import type { PgTable, PgTableWithColumns } from 'drizzle-orm/pg-core';
import { getTableConfig as getTableConfigPg } from 'drizzle-orm/pg-core';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { SQLiteTable, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { generatorsMap } from './generators/GeneratorFuncs.ts';
import type {
	AbstractGenerator,
	GenerateArray,
	GenerateCompositeUniqueKey,
	GenerateHashFromString,
	GenerateWeightedCount,
} from './generators/Generators.ts';
import type {
	DbType,
	GeneratedValueType,
	GeneratePossibleGeneratorsColumnType,
	GeneratePossibleGeneratorsTableType,
	RefinementsType,
	TableGeneratorsType,
	TableType,
} from './types/seedService.ts';
import type { Prettify, Relation, Table } from './types/tables.ts';

import type { CockroachTable, CockroachTableWithColumns } from 'drizzle-orm/cockroach-core';
import { CockroachDatabase } from 'drizzle-orm/cockroach-core';
import type { MsSqlTable, MsSqlTableWithColumns } from 'drizzle-orm/mssql-core';
import { getTableConfig as getTableConfigMsSql, MsSqlDatabase } from 'drizzle-orm/mssql-core';
import type { SingleStoreTable, SingleStoreTableWithColumns } from 'drizzle-orm/singlestore-core';
import { SingleStoreDatabase } from 'drizzle-orm/singlestore-core';
import { selectGeneratorForCockroachColumn } from './cockroach-core/selectGensForColumn.ts';
import { latestVersion } from './generators/apiVersion.ts';
import { selectGeneratorForMssqlColumn } from './mssql-core/selectGensForColumn.ts';
import { selectGeneratorForMysqlColumn } from './mysql-core/selectGensForColumn.ts';
import { selectGeneratorForPostgresColumn } from './pg-core/selectGensForColumn.ts';
import { selectGeneratorForSingleStoreColumn } from './singlestore-core/selectGensForColumn.ts';
import { selectGeneratorForSqlite } from './sqlite-core/selectGensForColumn.ts';
import { equalSets, intMax, isPostgresColumnIntLike } from './utils.ts';

export class SeedService {
	static readonly entityKind: string = 'SeedService';

	private defaultCountForTable = 10;
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
		connectionType: 'postgresql' | 'mysql' | 'sqlite' | 'mssql' | 'cockroach' | 'singlestore',
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
						columnPossibleGenerator.generator = new generatorsMap.GenerateDefault[0]({ defaultValue: null });
						columnPossibleGenerator.wasDefinedBefore = true;
					} else {
						columnPossibleGenerator.generator = new generatorsMap.HollowGenerator[0]();
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

				columnPossibleGenerator.generator.isUnique = col.isUnique;

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

	generateTablesValues = async (
		relations: (Relation & { isCyclic: boolean })[],
		tablesGenerators: ReturnType<typeof this.generatePossibleGenerators>,
		db?: DbType,
		schema?: { [key: string]: TableType },
		options?: {
			count?: number;
			seed?: number;
			preserveData?: boolean;
			preserveCyclicTablesData?: boolean;
			insertDataInDb?: boolean;
			updateDataInDb?: boolean;
			tablesValues?: {
				tableName: string;
				rows: {
					[columnName: string]: GeneratedValueType;
				}[];
			}[];
			tablesUniqueNotNullColumn?: { [tableName: string]: { uniqueNotNullColName: string } };
		},
	) => {
		const customSeed = options?.seed === undefined ? 0 : options.seed;
		let tableCount: number | undefined;
		let columnsGenerators: Prettify<GeneratePossibleGeneratorsColumnType>[];
		let tableGenerators: Prettify<TableGeneratorsType>;

		let tableValues: {
			[columnName: string]: GeneratedValueType;
		}[];

		let tablesValues: {
			tableName: string;
			rows: typeof tableValues;
		}[] = options?.tablesValues === undefined ? [] : options.tablesValues;

		let pRNGSeed: number;
		let filteredRelations: typeof relations;

		let preserveData: boolean, insertDataInDb: boolean = true, updateDataInDb: boolean = false;
		if (options?.preserveData !== undefined) preserveData = options.preserveData;
		if (options?.insertDataInDb !== undefined) insertDataInDb = options.insertDataInDb;
		if (options?.updateDataInDb !== undefined) updateDataInDb = options.updateDataInDb;
		if (updateDataInDb === true) insertDataInDb = false;

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

							refColumnValues = (await this.generateColumnsValuesByGenerators({
								tableGenerators: refColumnGenerator,
								count: tableCount,
								preserveData: true,
								insertDataInDb: false,
							}))!.map((rows) => rows[refColName]);

							hasSelfRelation = true;
							genObj = new generatorsMap.GenerateSelfRelationsValuesFromArray[0]({
								values: refColumnValues as (string | number | bigint)[],
							});
							genObj = this.selectVersionOfGenerator(genObj);
							// genObj = new GenerateSelfRelationsValuesFromArray({
							// 	values: refColumnValues,
							// });
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
							genObj = new generatorsMap.GenerateValuesFromArray[0]({
								values: refColumnValues as (string | number | bigint)[],
							});
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

			preserveData = (
					options?.preserveData === undefined
					&& tablesInOutRelations[table.tableName]?.in === 0
				)
				? false
				: true;

			preserveData = preserveData || (options?.preserveCyclicTablesData === true
				&& table.columnsPossibleGenerators.some((colGen) => colGen.isCyclic === true));

			tableValues = await this.generateColumnsValuesByGenerators({
				tableGenerators,
				db,
				schema,
				tableName: table.tableName,
				count: tableCount,
				preserveData,
				insertDataInDb,
				updateDataInDb,
				uniqueNotNullColName: options?.tablesUniqueNotNullColumn === undefined
					? undefined
					: options?.tablesUniqueNotNullColumn[table.tableName]?.uniqueNotNullColName,
			});

			if (preserveData === true) {
				tablesValues.push({
					tableName: table.tableName,
					rows: tableValues,
				});
			}

			// removing "link" from table that was required to generate current table
			if (tablesInOutRelations[table.tableName] !== undefined) {
				for (const tableName of tablesInOutRelations[table.tableName]!.requiredTableNames) {
					tablesInOutRelations[tableName]!.in -= 1;
				}
			}

			if (preserveData === false) {
				tablesValues = tablesValues.filter(
					(table) =>
						tablesInOutRelations[table.tableName] !== undefined && tablesInOutRelations[table.tableName]!.in > 0,
				);
			}
		}

		return tablesValues;
	};

	generateColumnsValuesByGenerators = async ({
		tableGenerators,
		db,
		schema,
		tableName,
		count,
		preserveData = true,
		insertDataInDb = true,
		updateDataInDb = false,
		uniqueNotNullColName,
		batchSize = 10000,
	}: {
		tableGenerators: Prettify<TableGeneratorsType>;
		db?: DbType;
		schema?: { [key: string]: TableType };
		tableName?: string;
		count?: number;
		preserveData?: boolean;
		insertDataInDb?: boolean;
		updateDataInDb?: boolean;
		uniqueNotNullColName?: string;
		batchSize?: number;
	}) => {
		if (count === undefined) {
			count = this.defaultCountForTable;
		}

		if (updateDataInDb === true) {
			batchSize = 1;
		}

		let columnGenerator: (typeof tableGenerators)[string];
		const columnsGenerators: {
			[columnName: string]: AbstractGenerator<any>;
		} = {};
		let generatedValues: { [columnName: string]: GeneratedValueType }[] = [];

		let columnsNumber = 0;
		let override = false;
		for (const columnName of Object.keys(tableGenerators)) {
			columnsNumber += 1;
			columnGenerator = tableGenerators[columnName]!;
			// postgres identity columns
			override = tableGenerators[columnName]?.generatedIdentityType === 'always' ? true : override;
			// mssql identity columns
			override = tableGenerators[columnName]?.identity === true ? true : override;

			columnsGenerators[columnName] = columnGenerator.generator!;
			columnsGenerators[columnName]!.init({
				count,
				seed: columnGenerator.pRNGSeed,
			});

			// const arrayGen = columnsGenerators[columnName]!.replaceIfArray({ count, seed: columnGenerator.pRNGSeed });
			// if (arrayGen !== undefined) {
			// 	columnsGenerators[columnName] = arrayGen;
			// }

			// const uniqueGen = columnsGenerators[columnName]!.replaceIfUnique({ count, seed: columnGenerator.pRNGSeed });
			// if (uniqueGen !== undefined) {
			// 	columnsGenerators[columnName] = uniqueGen;
			// }
		}

		// sequence updates will only be performed for PostgreSQL, since MySQL and SQLite already update their sequences correctly on their own.
		const columnsToUpdateSeq: Map<
			string,
			{ schemaName: string | undefined; tableName: string; columnName: string; valueToUpdate?: number | bigint }
		> = new Map();
		if (
			count > 0 && is(db, PgAsyncDatabase) && schema !== undefined && tableName !== undefined
			&& schema[tableName] !== undefined
		) {
			const tableConfig = getTableConfigPg(schema[tableName] as PgTable);
			for (const column of tableConfig.columns) {
				// TODO should I filter only primary key columns?
				// should I filter column by dataType or by column drizzle type?
				// column.dataType === 'number' || column.dataType === 'bigint'
				if (isPostgresColumnIntLike(column)) {
					columnsToUpdateSeq.set(column.name, {
						schemaName: tableConfig.schema,
						tableName: tableConfig.name,
						columnName: column.name,
						valueToUpdate: undefined,
					});
				}
			}
		}

		let maxParametersNumber: number;
		if (is(db, PgAsyncDatabase<any>)) {
			// @ts-ignore
			maxParametersNumber = db.constructor[entityKind] === 'PgliteDatabase'
				? this.postgresPgLiteMaxParametersNumber
				: this.postgresMaxParametersNumber;
		} else if (is(db, MySqlDatabase<any, any>)) {
			maxParametersNumber = this.mysqlMaxParametersNumber;
		} else if (is(db, BaseSQLiteDatabase<any, any>)) {
			maxParametersNumber = this.sqliteMaxParametersNumber;
		} else {
			// is(db, MsSqlDatabase<any, any>)
			maxParametersNumber = this.mssqlMaxParametersNumber;
		}
		const maxBatchSize = Math.floor(maxParametersNumber / columnsNumber);
		batchSize = batchSize > maxBatchSize ? maxBatchSize : batchSize;

		if (
			(insertDataInDb === true || updateDataInDb === true)
			&& (db === undefined || schema === undefined || tableName === undefined)
		) {
			throw new Error('db or schema or tableName is undefined.');
		}

		let row: { [columnName: string]: string | Buffer | bigint | number | boolean },
			generatedValue,
			i: number;

		for (i = 0; i < count; i++) {
			row = {};
			generatedValues.push(row);

			for (const columnName of Object.keys(columnsGenerators)) {
				generatedValue = columnsGenerators[columnName]!.generate({ i, columnName }) as
					| string
					| number
					| boolean;
				row[columnName as keyof typeof row] = generatedValue;

				const colToUpdateSeq = columnsToUpdateSeq.get(columnName);
				if (columnsToUpdateSeq.size !== 0 && colToUpdateSeq !== undefined) {
					colToUpdateSeq.valueToUpdate = colToUpdateSeq?.valueToUpdate === undefined
						? generatedValue as number | bigint
						: intMax([colToUpdateSeq!.valueToUpdate, generatedValue as number | bigint]);
				}
			}

			if (
				(insertDataInDb === true || updateDataInDb === true)
				&& ((i + 1) % batchSize === 0 || i === count - 1)
			) {
				if (preserveData === false) {
					if (insertDataInDb === true) {
						await this.insertInDb({
							generatedValues,
							db: db as DbType,
							schema: schema as {
								[key: string]: TableType;
							},
							tableName: tableName as string,
							override,
						});
					} else if (updateDataInDb === true) {
						await this.updateDb({
							generatedValues,
							db: db as DbType,
							schema: schema as {
								[key: string]: TableType;
							},
							tableName: tableName as string,
							uniqueNotNullColName: uniqueNotNullColName as string,
						});
					}

					generatedValues = [];
				} else {
					const batchCount = Math.floor(i / batchSize);

					if (insertDataInDb === true) {
						await this.insertInDb({
							generatedValues: generatedValues.slice(
								batchSize * batchCount,
								batchSize * (batchCount + 1),
							),
							db: db as DbType,
							schema: schema as {
								[key: string]: TableType;
							},
							tableName: tableName as string,
							override,
						});
					} else if (updateDataInDb === true) {
						await this.updateDb({
							generatedValues: generatedValues.slice(
								batchSize * batchCount,
								batchSize * (batchCount + 1),
							),
							db: db as DbType,
							schema: schema as {
								[key: string]: TableType;
							},
							tableName: tableName as string,
							uniqueNotNullColName: uniqueNotNullColName as string,
						});
					}
				}
			}

			const columnsToUpdateSeqFiltered = [...columnsToUpdateSeq.values()].filter((col) =>
				col.valueToUpdate !== undefined
			);
			if (
				i === count - 1
				&& columnsToUpdateSeqFiltered.length !== 0 && db !== undefined
			) {
				for (const columnConfig of columnsToUpdateSeq.values()) {
					if (columnConfig) {
						await this.updateColumnSequence({ db, columnConfig });
					}
				}
			}
		}

		return preserveData === true ? generatedValues : [];
	};

	updateColumnSequence = async ({ db, columnConfig: { schemaName, tableName, columnName, valueToUpdate } }: {
		db: DbType;
		columnConfig: { schemaName?: string; tableName: string; columnName: string; valueToUpdate?: number | bigint };
	}) => {
		if (is(db, PgAsyncDatabase)) {
			const fullTableName = schemaName ? `"${schemaName}"."${tableName}"` : `"${tableName}"`;
			const rawQuery = `SELECT setval(pg_get_serial_sequence('${fullTableName}', '${columnName}'), ${
				(valueToUpdate ?? 'null').toString()
			}, true);`;
			await db.execute(sql.raw(rawQuery));
		}
		// mysql updates auto_increment or serial column by itself
		// sqlite updates autoincrement  column by itself
		return;
	};

	insertInDb = async ({
		generatedValues,
		db,
		schema,
		tableName,
		override,
	}: {
		generatedValues: {
			[columnName: string]: GeneratedValueType;
		}[];
		db: DbType;
		schema: {
			[key: string]: TableType;
		};
		tableName: string;
		override: boolean;
	}) => {
		if (is(db, PgAsyncDatabase<any>)) {
			const query = db.insert((schema as { [key: string]: PgTable })[tableName]!);
			if (override === true) {
				return await query.overridingSystemValue().values(generatedValues);
			}
			await query.values(generatedValues);
		} else if (is(db, MySqlDatabase<any, any>)) {
			await db
				.insert((schema as { [key: string]: MySqlTable })[tableName]!)
				.values(generatedValues);
		} else if (is(db, BaseSQLiteDatabase<any, any>)) {
			await db
				.insert((schema as { [key: string]: SQLiteTable })[tableName]!)
				.values(generatedValues);
		} else if (is(db, MsSqlDatabase<any, any>)) {
			let schemaDbName: string | undefined;
			let tableDbName: string | undefined;
			if (override === true) {
				const tableConfig = getTableConfigMsSql(schema[tableName]! as MsSqlTable);
				schemaDbName = tableConfig.schema ?? 'dbo';
				tableDbName = tableConfig.name;
				await db.execute(sql.raw(`SET IDENTITY_INSERT [${schemaDbName}].[${tableDbName}] ON;`));
			}

			await db
				.insert((schema as { [key: string]: MsSqlTable })[tableName]!)
				.values(generatedValues);

			if (override === true) {
				await db.execute(sql.raw(`SET IDENTITY_INSERT [${schemaDbName}].[${tableDbName}] OFF;`));
			}
		} else if (is(db, CockroachDatabase<any, any>)) {
			const query = db
				.insert((schema as { [key: string]: CockroachTable })[tableName]!)
				.values(generatedValues);
			await query;
		} else if (is(db, SingleStoreDatabase<any, any>)) {
			const query = db
				.insert((schema as { [key: string]: SingleStoreTable })[tableName]!)
				.values(generatedValues);
			await query;
		}
	};

	updateDb = async ({
		generatedValues,
		db,
		schema,
		tableName,
		uniqueNotNullColName,
	}: {
		generatedValues: {
			[columnName: string]: GeneratedValueType;
		}[];
		db: DbType;
		schema: {
			[key: string]: TableType;
		};
		tableName: string;
		uniqueNotNullColName: string;
	}) => {
		let values = generatedValues[0]!;
		const uniqueNotNullColValue = values[uniqueNotNullColName];
		values = Object.fromEntries(Object.entries(values).filter(([colName]) => colName !== uniqueNotNullColName));

		if (is(db, PgAsyncDatabase<any>)) {
			const table = (schema as { [key: string]: PgTableWithColumns<any> })[tableName]!;
			const uniqueNotNullCol = table[uniqueNotNullColName];
			await db.update(table).set(values).where(
				eq(uniqueNotNullCol, uniqueNotNullColValue),
			);
		} else if (is(db, MySqlDatabase<any, any>)) {
			const table = (schema as { [key: string]: MySqlTableWithColumns<any> })[tableName]!;
			await db.update(table).set(values).where(
				eq(table[uniqueNotNullColName], uniqueNotNullColValue),
			);
		} else if (is(db, BaseSQLiteDatabase<any, any>)) {
			const table = (schema as { [key: string]: SQLiteTableWithColumns<any> })[tableName]!;
			await db.update(table).set(values).where(
				eq(table[uniqueNotNullColName], uniqueNotNullColValue),
			);
		} else if (is(db, MsSqlDatabase<any, any>)) {
			const table = (schema as { [key: string]: MsSqlTableWithColumns<any> })[tableName]!;
			await db.update(table).set(values).where(
				eq(table[uniqueNotNullColName], uniqueNotNullColValue),
			);
		} else if (is(db, CockroachDatabase<any, any>)) {
			const table = (schema as { [key: string]: CockroachTableWithColumns<any> })[tableName]!;
			await db.update(table).set(values).where(
				eq(table[uniqueNotNullColName], uniqueNotNullColValue),
			);
		} else if (is(db, SingleStoreDatabase<any, any>)) {
			const table = (schema as { [key: string]: SingleStoreTableWithColumns<any> })[tableName]!;
			await db.update(table).set(values).where(
				eq(table[uniqueNotNullColName], uniqueNotNullColValue),
			);
		}
	};
}
