import { entityKind, is } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import { MySqlDatabase } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { PgDatabase } from 'drizzle-orm/pg-core';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type {
	GeneratePossibleGeneratorsColumnType,
	GeneratePossibleGeneratorsTableType,
	RefinementsType,
	TableGeneratorsType,
} from '../types/seedService.ts';
import type { Column, Prettify, Relation, Table } from '../types/tables.ts';
import type { AbstractGenerator } from './GeneratorsWrappers.ts';
import {
	GenerateBoolean,
	GenerateDate,
	GenerateDatetime,
	GenerateDefault,
	GenerateEmail,
	GenerateEnum,
	GenerateFirstName,
	GenerateInt,
	GenerateInterval,
	GenerateIntPrimaryKey,
	GenerateJson,
	GenerateLine,
	GenerateNumber,
	GeneratePoint,
	GenerateSelfRelationsValuesFromArray,
	GenerateString,
	GenerateTime,
	GenerateTimestamp,
	GenerateUniqueString,
	GenerateValuesFromArray,
	GenerateWeightedCount,
	GenerateYear,
	HollowGenerator,
} from './GeneratorsWrappers.ts';
import { generateHashFromString } from './utils.ts';

class SeedService {
	static readonly [entityKind]: string = 'SeedService';

	private defaultCountForTable = 10;
	private postgresPgLiteMaxParametersNumber = 32740;
	private postgresMaxParametersNumber = 65535;
	// there is no max parameters number in mysql, so you can increase mysqlMaxParametersNumber if it's needed.
	private mysqlMaxParametersNumber = 100000;
	//  SQLITE_MAX_VARIABLE_NUMBER, which by default equals to 999 for SQLite versions prior to 3.32.0 (2020-05-22) or 32766 for SQLite versions after 3.32.0.
	private sqliteMaxParametersNumber = 32766;

	generatePossibleGenerators = (
		connectionType: 'postgresql' | 'mysql' | 'sqlite',
		tables: Table[],
		relations: Relation[],
		refinements?: RefinementsType,
		options?: { count?: number; seed?: number },
	) => {
		let columnPossibleGenerator: Prettify<GeneratePossibleGeneratorsColumnType>;
		let tablePossibleGenerators: Prettify<GeneratePossibleGeneratorsTableType>;
		const customSeed = options?.seed === undefined ? 0 : options.seed;

		// sorting table in order which they will be filled up (tables with foreign keys case)
		// relations = relations.filter(rel => rel.type === "one");
		const tablesInOutRelations = this.getTablesInOutRelations(relations);
		const orderedTablesNames = this.getOrderedTablesList(tablesInOutRelations);
		tables = tables.sort((table1, table2) => {
			const table1Order = orderedTablesNames.indexOf(
					table1.name,
				),
				table2Order = orderedTablesNames.indexOf(
					table2.name,
				);
			return table1Order - table2Order;
		});

		const tablesPossibleGenerators: Prettify<
			(typeof tablePossibleGenerators)[]
		> = tables.map((table) => ({
			tableName: table.name,
			columnsPossibleGenerators: [],
			withFromTable: {},
		}));

		for (const [i, table] of tables.entries()) {
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
								: `"${fkTableName}" table doesn't have reference to "${table.name}" table`;
							throw new Error(
								`${reason}. you can't specify "${fkTableName}" as parameter in ${table.name}.with object.`,
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
									+ generateHashFromString(`${table.name}.${fkTableName}`);

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
					generatedIdentityType: col.generatedIdentityType,
					generator: undefined,
				};

				if (
					refinements !== undefined
					&& refinements[table.name] !== undefined
					&& refinements[table.name]!.columns !== undefined
					&& refinements[table.name]!.columns[col.name] !== undefined
				) {
					const genObj = refinements[table.name]!.columns[col.name]!;
					// for now only GenerateValuesFromArray support notNull property
					genObj.notNull = col.notNull;

					columnPossibleGenerator.generator = genObj;
				} else if (Object.hasOwn(foreignKeyColumns, col.name)) {
					// TODO: I might need to assign repeatedValuesCount to column there instead of doing so in generateTablesValues
					columnPossibleGenerator.generator = new HollowGenerator({});
				} else if (col.hasDefault && col.default !== undefined) {
					columnPossibleGenerator.generator = new GenerateDefault({
						defaultValue: col.default,
					});
				} // TODO: rewrite pickGeneratorFor... using new col properties: isUnique and notNull
				else if (connectionType === 'postgresql') {
					columnPossibleGenerator = this.pickGeneratorForPostgresColumn(
						columnPossibleGenerator,
						table,
						col,
					);
				} else if (connectionType === 'mysql') {
					columnPossibleGenerator = this.pickGeneratorForMysqlColumn(
						columnPossibleGenerator,
						table,
						col,
					);
				} else if (connectionType === 'sqlite') {
					columnPossibleGenerator = this.pickGeneratorForSqlite(
						columnPossibleGenerator,
						table,
						col,
					);
				}

				if (columnPossibleGenerator.generator === undefined) {
					throw new Error(
						`column with type ${col.columnType} is not supported for now.`,
					);
				}

				columnPossibleGenerator.generator.isUnique = col.isUnique;
				columnPossibleGenerator.generator.dataType = col.dataType;
				tablePossibleGenerators.columnsPossibleGenerators.push(
					columnPossibleGenerator,
				);
			}
		}

		return tablesPossibleGenerators;
	};

	getOrderedTablesList = (tablesInOutRelations: ReturnType<typeof this.getTablesInOutRelations>): string[] => {
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

			if (tablesInOutRelations[parent]!.requiredTableNames.size === 0) {
				orderedTablesNames.push(parent);
			} else {
				leafTablesNames.push(parent);
				continue;
			}

			children = [...tablesInOutRelations[parent]!.dependantTableNames];
			leafTablesNames.push(...children);
		}
		return orderedTablesNames;
	};

	getTablesInOutRelations = (relations: Relation[]) => {
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

		for (const rel of relations) {
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

			if (tablesInOutRelations[rel.refTable] === undefined) {
				tablesInOutRelations[rel.refTable] = {
					out: 0,
					in: 0,
					selfRelation: false,
					selfRelCount: 0,
					requiredTableNames: new Set(),
					dependantTableNames: new Set(),
				};
			}

			tablesInOutRelations[rel.table]!.out += 1;
			tablesInOutRelations[rel.refTable]!.in += 1;

			if (rel.refTable === rel.table) {
				tablesInOutRelations[rel.table]!.selfRelation = true;
				tablesInOutRelations[rel.table]!.selfRelCount = rel.columns.length;
			} else {
				tablesInOutRelations[rel.table]!.requiredTableNames.add(rel.refTable);
				tablesInOutRelations[rel.refTable]!.dependantTableNames.add(rel.table);
			}
		}

		return tablesInOutRelations;
	};

	getWeightedWithCount = (
		weightedCount: { weight: number; count: number | number[] }[],
		count: number,
		seed: number,
	) => {
		const gen = new GenerateWeightedCount({});
		gen.init({ count: weightedCount, seed });
		let weightedWithCount = 0;
		for (let i = 0; i < count; i++) {
			weightedWithCount += gen.generate();
		}

		return weightedWithCount;
	};

	// TODO: revise serial part generators
	pickGeneratorForPostgresColumn = (
		columnPossibleGenerator: Prettify<GeneratePossibleGeneratorsColumnType>,
		table: Table,
		col: Column,
	) => {
		// INT ------------------------------------------------------------------------------------------------------------
		if (
			(col.columnType.includes('serial')
				|| col.columnType === 'integer'
				|| col.columnType === 'smallint'
				|| col.columnType.includes('bigint'))
			&& table.primaryKeys.includes(col.name)
		) {
			columnPossibleGenerator.generator = new GenerateIntPrimaryKey({});
			return columnPossibleGenerator;
		}

		let minValue: number | bigint | undefined;
		let maxValue: number | bigint | undefined;
		if (col.columnType.includes('serial')) {
			minValue = 1;
			if (col.columnType === 'smallserial') {
				// 2^16 / 2 - 1, 2 bytes
				maxValue = 32767;
			} else if (col.columnType === 'serial') {
				// 2^32 / 2 - 1, 4 bytes
				maxValue = 2147483647;
			} else if (col.columnType === 'bigserial') {
				// 2^64 / 2 - 1, 8 bytes
				minValue = BigInt(1);
				maxValue = BigInt('9223372036854775807');
			}
		} else if (col.columnType.includes('int')) {
			if (col.columnType === 'smallint') {
				// 2^16 / 2 - 1, 2 bytes
				minValue = -32768;
				maxValue = 32767;
			} else if (col.columnType === 'integer') {
				// 2^32 / 2 - 1, 4 bytes
				minValue = -2147483648;
				maxValue = 2147483647;
			} else if (col.columnType.includes('bigint')) {
				if (col.dataType === 'bigint') {
					// 2^64 / 2 - 1, 8 bytes
					minValue = BigInt('-9223372036854775808');
					maxValue = BigInt('9223372036854775807');
				} else if (col.dataType === 'number') {
					// if you’re expecting values above 2^31 but below 2^53
					minValue = -9007199254740991;
					maxValue = 9007199254740991;
				}
			}
		}

		if (
			col.columnType.includes('int')
			&& !col.columnType.includes('interval')
			&& !col.columnType.includes('point')
		) {
			columnPossibleGenerator.generator = new GenerateInt({
				minValue,
				maxValue,
			});
			return columnPossibleGenerator;
		}

		if (col.columnType.includes('serial')) {
			const genObj = new GenerateIntPrimaryKey({});
			genObj.maxValue = maxValue;
			columnPossibleGenerator.generator = genObj;
		}

		// NUMBER(real, double, decimal, numeric)
		if (
			col.columnType === 'real'
			|| col.columnType === 'doubleprecision'
			|| col.columnType === 'decimal'
			|| col.columnType === 'numeric'
		) {
			columnPossibleGenerator.generator = new GenerateNumber({});
			return columnPossibleGenerator;
		}

		// STRING
		if (
			(col.columnType === 'text'
				|| col.columnType === 'varchar'
				|| col.columnType === 'char')
			&& table.primaryKeys.includes(col.name)
		) {
			columnPossibleGenerator.generator = new GenerateUniqueString({});
			return columnPossibleGenerator;
		}

		if (
			(col.columnType === 'text'
				|| col.columnType === 'varchar'
				|| col.columnType === 'char')
			&& col.name.toLowerCase().includes('name')
		) {
			columnPossibleGenerator.generator = new GenerateFirstName({});
			return columnPossibleGenerator;
		}

		if (
			(col.columnType === 'text'
				|| col.columnType === 'varchar'
				|| col.columnType === 'char')
			&& col.name.toLowerCase().includes('email')
		) {
			columnPossibleGenerator.generator = new GenerateEmail({});
			return columnPossibleGenerator;
		}

		if (
			col.columnType === 'text'
			|| col.columnType === 'varchar'
			|| col.columnType === 'char'
		) {
			// console.log(col, table)
			columnPossibleGenerator.generator = new GenerateString({});
			return columnPossibleGenerator;
		}

		// BOOLEAN
		if (col.columnType === 'boolean') {
			columnPossibleGenerator.generator = new GenerateBoolean({});
			return columnPossibleGenerator;
		}

		// DATE, TIME, TIMESTAMP
		if (col.columnType.includes('date')) {
			columnPossibleGenerator.generator = new GenerateDate({});
			return columnPossibleGenerator;
		}

		if (col.columnType === 'time') {
			columnPossibleGenerator.generator = new GenerateTime({});
			return columnPossibleGenerator;
		}

		if (col.columnType.includes('timestamp')) {
			columnPossibleGenerator.generator = new GenerateTimestamp({});
			return columnPossibleGenerator;
		}

		// JSON, JSONB
		if (col.columnType === 'json' || col.columnType === 'jsonb') {
			columnPossibleGenerator.generator = new GenerateJson({});
			return columnPossibleGenerator;
		}

		// if (col.columnType === "jsonb") {
		//   columnPossibleGenerator.generator = new GenerateJsonb({});
		//   return columnPossibleGenerator;
		// }

		// ENUM
		if (col.enumValues !== undefined) {
			columnPossibleGenerator.generator = new GenerateEnum({
				enumValues: col.enumValues,
			});
			return columnPossibleGenerator;
		}

		// INTERVAL
		if (col.columnType === 'interval') {
			columnPossibleGenerator.generator = new GenerateInterval({});
			return columnPossibleGenerator;
		}

		// POINT, LINE
		if (col.columnType.includes('point')) {
			columnPossibleGenerator.generator = new GeneratePoint({});
			return columnPossibleGenerator;
		}

		if (col.columnType.includes('line')) {
			columnPossibleGenerator.generator = new GenerateLine({});
			return columnPossibleGenerator;
		}

		return columnPossibleGenerator;
	};

	pickGeneratorForMysqlColumn = (
		columnPossibleGenerator: Prettify<GeneratePossibleGeneratorsColumnType>,
		table: Table,
		col: Column,
	) => {
		// console.log(col);
		// INT ------------------------------------------------------------------------------------------------------------
		if (
			(col.columnType.includes('serial') || col.columnType.includes('int'))
			&& table.primaryKeys.includes(col.name)
		) {
			columnPossibleGenerator.generator = new GenerateIntPrimaryKey({});
			return columnPossibleGenerator;
		}

		let minValue: number | bigint | undefined;
		let maxValue: number | bigint | undefined;
		if (col.columnType === 'serial') {
			// 2^64 % 2 - 1, 8 bytes
			minValue = BigInt(0);
			maxValue = BigInt('9223372036854775807');
		} else if (col.columnType.includes('int')) {
			if (col.columnType === 'tinyint') {
				// 2^8 / 2 - 1, 1 bytes
				minValue = -128;
				maxValue = 127;
			} else if (col.columnType === 'smallint') {
				// 2^16 / 2 - 1, 2 bytes
				minValue = -32768;
				maxValue = 32767;
			} else if (col.columnType === 'mediumint') {
				// 2^16 / 2 - 1, 2 bytes
				minValue = -8388608;
				maxValue = 8388607;
			} else if (col.columnType === 'int') {
				// 2^32 / 2 - 1, 4 bytes
				minValue = -2147483648;
				maxValue = 2147483647;
			} else if (col.columnType === 'bigint') {
				// 2^64 / 2 - 1, 8 bytes
				minValue = BigInt('-9223372036854775808');
				maxValue = BigInt('9223372036854775807');
			}
		}

		if (col.columnType.includes('int')) {
			columnPossibleGenerator.generator = new GenerateInt({
				minValue,
				maxValue,
			});
			return columnPossibleGenerator;
		}

		if (col.columnType.includes('serial')) {
			const genObj = new GenerateIntPrimaryKey({});
			genObj.maxValue = maxValue;
			columnPossibleGenerator.generator = genObj;
		}

		// NUMBER(real, double, decimal, float)
		if (
			col.columnType === 'real'
			|| col.columnType === 'double'
			|| col.columnType === 'decimal'
			|| col.columnType === 'float'
		) {
			columnPossibleGenerator.generator = new GenerateNumber({});
			return columnPossibleGenerator;
		}

		// STRING
		if (
			(col.columnType === 'text'
				|| col.columnType === 'blob'
				|| col.columnType.includes('char')
				|| col.columnType.includes('varchar')
				|| col.columnType.includes('binary')
				|| col.columnType.includes('varbinary'))
			&& table.primaryKeys.includes(col.name)
		) {
			columnPossibleGenerator.generator = new GenerateUniqueString({});
			return columnPossibleGenerator;
		}

		if (
			(col.columnType === 'text'
				|| col.columnType === 'blob'
				|| col.columnType.includes('char')
				|| col.columnType.includes('varchar')
				|| col.columnType.includes('binary')
				|| col.columnType.includes('varbinary'))
			&& col.name.toLowerCase().includes('name')
		) {
			columnPossibleGenerator.generator = new GenerateFirstName({});
			return columnPossibleGenerator;
		}

		if (
			(col.columnType === 'text'
				|| col.columnType === 'blob'
				|| col.columnType.includes('char')
				|| col.columnType.includes('varchar')
				|| col.columnType.includes('binary')
				|| col.columnType.includes('varbinary'))
			&& col.name.toLowerCase().includes('email')
		) {
			columnPossibleGenerator.generator = new GenerateEmail({});
			return columnPossibleGenerator;
		}

		if (
			col.columnType === 'text'
			|| col.columnType === 'blob'
			|| col.columnType.includes('char')
			|| col.columnType.includes('varchar')
			|| col.columnType.includes('binary')
			|| col.columnType.includes('varbinary')
		) {
			// console.log(col, table);
			columnPossibleGenerator.generator = new GenerateString({});
			return columnPossibleGenerator;
		}

		// BOOLEAN
		if (col.columnType === 'boolean') {
			columnPossibleGenerator.generator = new GenerateBoolean({});
			return columnPossibleGenerator;
		}

		// DATE, TIME, TIMESTAMP, DATETIME, YEAR
		if (col.columnType.includes('datetime')) {
			columnPossibleGenerator.generator = new GenerateDatetime({});
			return columnPossibleGenerator;
		}

		if (col.columnType.includes('date')) {
			columnPossibleGenerator.generator = new GenerateDate({});
			return columnPossibleGenerator;
		}

		if (col.columnType === 'time') {
			columnPossibleGenerator.generator = new GenerateTime({});
			return columnPossibleGenerator;
		}

		if (col.columnType.includes('timestamp')) {
			columnPossibleGenerator.generator = new GenerateTimestamp({});
			return columnPossibleGenerator;
		}

		if (col.columnType === 'year') {
			columnPossibleGenerator.generator = new GenerateYear({});
			return columnPossibleGenerator;
		}

		// JSON
		if (col.columnType === 'json') {
			columnPossibleGenerator.generator = new GenerateJson({});
			return columnPossibleGenerator;
		}

		// ENUM
		if (col.enumValues !== undefined) {
			columnPossibleGenerator.generator = new GenerateEnum({
				enumValues: col.enumValues,
			});
			return columnPossibleGenerator;
		}

		return columnPossibleGenerator;
	};

	pickGeneratorForSqlite = (
		columnPossibleGenerator: Prettify<GeneratePossibleGeneratorsColumnType>,
		table: Table,
		col: Column,
	) => {
		// int section ---------------------------------------------------------------------------------------
		if (
			(col.columnType === 'integer' || col.columnType === 'numeric')
			&& table.primaryKeys.includes(col.name)
		) {
			columnPossibleGenerator.generator = new GenerateIntPrimaryKey({});
			return columnPossibleGenerator;
		}

		if (
			col.columnType === 'integer'
			|| col.columnType === 'numeric'
			|| col.columnType === 'bigint'
		) {
			columnPossibleGenerator.generator = new GenerateInt({});
			return columnPossibleGenerator;
		}

		if (col.columnType === 'boolean') {
			columnPossibleGenerator.generator = new GenerateBoolean({});
			return columnPossibleGenerator;
		}

		// number section ------------------------------------------------------------------------------------
		if (col.columnType === 'real' || col.columnType === 'numeric') {
			columnPossibleGenerator.generator = new GenerateNumber({});
			return columnPossibleGenerator;
		}

		// string section ------------------------------------------------------------------------------------
		if (
			(col.columnType === 'text'
				|| col.columnType === 'numeric'
				|| col.columnType === 'blob')
			&& table.primaryKeys.includes(col.name)
		) {
			columnPossibleGenerator.generator = new GenerateUniqueString({});
			return columnPossibleGenerator;
		}

		if (
			(col.columnType === 'text'
				|| col.columnType === 'numeric'
				|| col.columnType === 'blob')
			&& col.name.toLowerCase().includes('name')
		) {
			columnPossibleGenerator.generator = new GenerateFirstName({});
			return columnPossibleGenerator;
		}

		if (
			(col.columnType === 'text'
				|| col.columnType === 'numeric'
				|| col.columnType === 'blob')
			&& col.name.toLowerCase().includes('email')
		) {
			columnPossibleGenerator.generator = new GenerateEmail({});
			return columnPossibleGenerator;
		}

		if (
			col.columnType === 'text'
			|| col.columnType === 'numeric'
			|| col.columnType === 'blob'
			|| col.columnType === 'blobbuffer'
		) {
			columnPossibleGenerator.generator = new GenerateString({});
			return columnPossibleGenerator;
		}

		if (col.columnType === 'textjson' || col.columnType === 'blobjson') {
			columnPossibleGenerator.generator = new GenerateJson({});
			return columnPossibleGenerator;
		}

		if (col.columnType === 'timestamp' || col.columnType === 'timestamp_ms') {
			columnPossibleGenerator.generator = new GenerateTimestamp({});
			return columnPossibleGenerator;
		}

		return columnPossibleGenerator;
	};

	generateTablesValues = async (
		relations: Relation[],
		tablesGenerators: ReturnType<typeof this.generatePossibleGenerators>,
		db?:
			| PgDatabase<any>
			| MySqlDatabase<any, any>
			| BaseSQLiteDatabase<any, any>,
		schema?: { [key: string]: PgTable | MySqlTable | SQLiteTable },
		options?: { count?: number; seed?: number; preserveData?: boolean; insertDataInDb?: boolean },
	) => {
		// console.time(
		//   "generateTablesValues-----------------------------------------------------"
		// );
		const customSeed = options?.seed === undefined ? 0 : options.seed;
		let tableCount: number | undefined;
		let columnsGenerators: Prettify<GeneratePossibleGeneratorsColumnType>[];
		let tableGenerators: Prettify<TableGeneratorsType>;

		let tableValues: {
			[columnName: string]: string | number | boolean | undefined;
		}[];

		let tablesValues: {
			tableName: string;
			rows: typeof tableValues;
		}[] = [];

		let pRNGSeed: number;
		// relations = relations.filter(rel => rel.type === "one");
		let filteredRelations: Relation[];

		let preserveData: boolean, insertDataInDb: boolean = true;
		if (options?.preserveData !== undefined) preserveData = options.preserveData;
		if (options?.insertDataInDb !== undefined) insertDataInDb = options.insertDataInDb;

		// TODO: now I'm generating tablesInOutRelations twice, first time in generatePossibleGenerators and second time here. maybe should generate it once instead.
		const tablesInOutRelations = this.getTablesInOutRelations(relations);
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
					? (customSeed + generateHashFromString(
						`${columnRelations[0]!.table}.${columnRelations[0]!.columns.join('_')}`,
					))
					: (customSeed + generateHashFromString(`${table.tableName}.${col.columnName}`));

				tableGenerators[col.columnName] = {
					pRNGSeed,
					...col,
				};
			}

			// get values to generate columns with foreign key

			// if table posts contains foreign key to table users, then rel.table === 'posts' and rel.refTable === 'users', because table posts has reference to table users.
			if (filteredRelations.length !== 0) {
				for (const rel of filteredRelations) {
					if (
						table.withFromTable[rel.refTable] !== undefined
						&& table.withCount !== undefined
					) {
						tableCount = table.withCount;
					}

					for (let colIdx = 0; colIdx < rel.columns.length; colIdx++) {
						let refColumnValues: (string | number | boolean)[];
						let hasSelfRelation: boolean;
						let repeatedValuesCount:
								| number
								| { weight: number; count: number | number[] }[]
								| undefined,
							weightedCountSeed: number | undefined;
						let genObj: AbstractGenerator<any>;

						if (rel.table === rel.refTable) {
							const refColName = rel.refColumns[colIdx] as string;
							pRNGSeed = generateHashFromString(
								`${table.tableName}.${refColName}`,
							);

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
							}))!.map((rows) => rows[refColName]) as (string | number | boolean)[];

							hasSelfRelation = true;
							genObj = new GenerateSelfRelationsValuesFromArray({
								values: refColumnValues,
							});
						} else {
							refColumnValues = tablesValues
								.find((val) => val.tableName === rel.refTable)!
								.rows!.map((row) => row[rel.refColumns[colIdx]!]!);
							hasSelfRelation = false;

							if (
								table.withFromTable[rel.refTable] !== undefined
								&& table.withFromTable[rel.refTable]!.repeatedValuesCount
									!== undefined
							) {
								repeatedValuesCount = table.withFromTable[rel.refTable]!.repeatedValuesCount;
								weightedCountSeed = table.withFromTable[rel.refTable]!.weightedCountSeed;
							}

							genObj = new GenerateValuesFromArray({ values: refColumnValues });
							(genObj as GenerateValuesFromArray).notNull = tableGenerators[rel.columns[colIdx]!]!.notNull;
							(genObj as GenerateValuesFromArray).weightedCountSeed = weightedCountSeed;
							(genObj as GenerateValuesFromArray).maxRepeatedValuesCount = repeatedValuesCount;
						}

						// console.log(rel.columns[colIdx], tableGenerators)
						tableGenerators[rel.columns[colIdx]!]!.generator = genObj;
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

			tableValues = await this.generateColumnsValuesByGenerators({
				tableGenerators,
				db,
				schema,
				tableName: table.tableName,
				count: tableCount,
				preserveData,
				insertDataInDb,
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
		batchSize = 10000,
	}: {
		tableGenerators: Prettify<TableGeneratorsType>;
		db?:
			| PgDatabase<any>
			| MySqlDatabase<any, any>
			| BaseSQLiteDatabase<any, any>;
		schema?: { [key: string]: PgTable | MySqlTable | SQLiteTable };
		tableName?: string;
		count?: number;
		preserveData?: boolean;
		insertDataInDb?: boolean;
		batchSize?: number;
	}) => {
		if (count === undefined) {
			count = this.defaultCountForTable;
		}

		let columnGenerator: (typeof tableGenerators)[string];
		const columnsGenerators: {
			[columnName: string]: AbstractGenerator<any>;
		} = {};
		let generatedValues: { [columnName: string]: number | string | boolean | undefined }[] = [];

		let columnsNumber = 0;
		let override = false;
		for (const columnName of Object.keys(tableGenerators)) {
			columnsNumber += 1;
			columnGenerator = tableGenerators[columnName]!;
			override = tableGenerators[columnName]?.generatedIdentityType === 'always' ? true : override;

			columnsGenerators[columnName] = columnGenerator.generator!;
			columnsGenerators[columnName]!.init({
				count,
				seed: columnGenerator.pRNGSeed,
			});

			if (
				columnsGenerators[columnName]!.uniqueVersionOfGen !== undefined
				&& columnsGenerators[columnName]!.isUnique === true
			) {
				const uniqueGen = new columnsGenerators[columnName]!.uniqueVersionOfGen!({
					...columnsGenerators[columnName]!.params,
				});
				uniqueGen.init({
					count,
					seed: columnGenerator.pRNGSeed,
				});
				uniqueGen.isUnique = columnsGenerators[columnName]!.isUnique;
				uniqueGen.dataType = columnsGenerators[columnName]!.dataType;

				columnsGenerators[columnName] = uniqueGen;
			}
		}
		let maxParametersNumber: number;
		if (is(db, PgDatabase<any>)) {
			// @ts-ignore
			maxParametersNumber = db.constructor[entityKind] === 'PgliteDatabase'
				? this.postgresPgLiteMaxParametersNumber
				: this.postgresMaxParametersNumber;
		} else if (is(db, MySqlDatabase<any, any>)) {
			maxParametersNumber = this.mysqlMaxParametersNumber;
		} else {
			// is(db, BaseSQLiteDatabase<any, any>)
			maxParametersNumber = this.sqliteMaxParametersNumber;
		}
		const maxBatchSize = Math.floor(maxParametersNumber / columnsNumber);
		batchSize = batchSize > maxBatchSize ? maxBatchSize : batchSize;

		if (
			insertDataInDb === true
			&& (db === undefined || schema === undefined || tableName === undefined)
		) {
			throw new Error('db or schema or tableName is undefined.');
		}

		let row: { [columnName: string]: string | number | boolean },
			generatedValue,
			i: number;

		for (i = 0; i < count; i++) {
			row = {};
			generatedValues.push(row);

			for (const columnName of Object.keys(columnsGenerators)) {
				// generatedValue = columnsGenerators[columnName].next().value as
				//   | string
				//   | number
				//   | boolean;
				generatedValue = columnsGenerators[columnName]!.generate({ i }) as
					| string
					| number
					| boolean;
				row[columnName as keyof typeof row] = generatedValue;
			}

			if (
				insertDataInDb === true
				&& ((i + 1) % batchSize === 0 || i === count - 1)
			) {
				if (preserveData === false) {
					await this.insertInDb({
						generatedValues,
						db: db as
							| PgDatabase<any>
							| MySqlDatabase<any, any>
							| BaseSQLiteDatabase<any, any>,
						schema: schema as {
							[key: string]: PgTable | MySqlTable | SQLiteTable;
						},
						tableName: tableName as string,
						override,
					});
					generatedValues = [];
				} else {
					const batchCount = Math.floor(i / batchSize);

					await this.insertInDb({
						generatedValues: generatedValues.slice(
							batchSize * batchCount,
							batchSize * (batchCount + 1),
						),
						db: db as
							| PgDatabase<any>
							| MySqlDatabase<any, any>
							| BaseSQLiteDatabase<any, any>,
						schema: schema as {
							[key: string]: PgTable | MySqlTable | SQLiteTable;
						},
						tableName: tableName as string,
						override,
					});
				}
			}
		}

		return preserveData === true ? generatedValues : [];
	};

	insertInDb = async ({
		generatedValues,
		db,
		schema,
		tableName,
		override,
	}: {
		generatedValues: {
			[columnName: string]: number | string | boolean | undefined;
		}[];
		db:
			| PgDatabase<any>
			| MySqlDatabase<any, any>
			| BaseSQLiteDatabase<any, any>;
		schema: {
			[key: string]: PgTable | MySqlTable | SQLiteTable;
		};
		tableName: string;
		override: boolean;
	}) => {
		if (is(db, PgDatabase<any>)) {
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
		}
	};
}

export default new SeedService();
