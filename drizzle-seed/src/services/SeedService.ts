/* eslint-disable drizzle-internal/require-entity-kind */
import { entityKind, eq, is } from 'drizzle-orm';
import type { MySqlTable, MySqlTableWithColumns } from 'drizzle-orm/mysql-core';
import { MySqlDatabase } from 'drizzle-orm/mysql-core';
import type { PgTable, PgTableWithColumns } from 'drizzle-orm/pg-core';
import { PgDatabase } from 'drizzle-orm/pg-core';
import type { SQLiteTable, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type {
	GeneratePossibleGeneratorsColumnType,
	GeneratePossibleGeneratorsTableType,
	RefinementsType,
	TableGeneratorsType,
} from '../types/seedService.ts';
import type { Column, Prettify, Relation, Table } from '../types/tables.ts';
import { generatorsMap } from './GeneratorFuncs.ts';
import type { AbstractGenerator, GenerateArray, GenerateInterval, GenerateWeightedCount } from './Generators.ts';

import { latestVersion } from './apiVersion.ts';
import { equalSets, generateHashFromString } from './utils.ts';

export class SeedService {
	static readonly entityKind: string = 'SeedService';

	private defaultCountForTable = 10;
	private postgresPgLiteMaxParametersNumber = 32740;
	private postgresMaxParametersNumber = 65535;
	// there is no max parameters number in mysql, so you can increase mysqlMaxParametersNumber if it's needed.
	private mysqlMaxParametersNumber = 100000;
	//  SQLITE_MAX_VARIABLE_NUMBER, which by default equals to 999 for SQLite versions prior to 3.32.0 (2020-05-22) or 32766 for SQLite versions after 3.32.0.
	private sqliteMaxParametersNumber = 32766;
	private version?: number;

	generatePossibleGenerators = (
		connectionType: 'postgresql' | 'mysql' | 'sqlite',
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
					primary: col.primary,
					generatedIdentityType: col.generatedIdentityType,
					generator: undefined,
					isCyclic: false,
					wasDefinedBefore: false,
					wasRefined: false,
				};

				if (
					refinements !== undefined
					&& refinements[table.name] !== undefined
					&& refinements[table.name]!.columns !== undefined
					&& refinements[table.name]!.columns[col.name] !== undefined
				) {
					const genObj = refinements[table.name]!.columns[col.name]!;

					if (col.columnType.match(/\[\w*]/g) !== null) {
						if (
							(col.baseColumn?.dataType === 'array' && col.baseColumn.columnType.match(/\[\w*]/g) !== null)
							// studio case
							|| (col.typeParams.dimensions !== undefined && col.typeParams.dimensions > 1)
						) {
							throw new Error("for now you can't specify generators for columns of dimension greater than 1.");
						}

						genObj.baseColumnDataType = col.baseColumn?.dataType;
					}

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
					columnPossibleGenerator.generator = this.selectGeneratorForPostgresColumn(
						table,
						col,
					);
				} else if (connectionType === 'mysql') {
					columnPossibleGenerator.generator = this.selectGeneratorForMysqlColumn(
						table,
						col,
					);
				} else if (connectionType === 'sqlite') {
					columnPossibleGenerator.generator = this.selectGeneratorForSqlite(
						table,
						col,
					);
				}

				if (columnPossibleGenerator.generator === undefined) {
					throw new Error(
						`column with type ${col.columnType} is not supported for now.`,
					);
				}

				const arrayGen = columnPossibleGenerator.generator.replaceIfArray();
				if (arrayGen !== undefined) {
					columnPossibleGenerator.generator = arrayGen;
				}

				columnPossibleGenerator.generator.isUnique = col.isUnique;
				const uniqueGen = columnPossibleGenerator.generator.replaceIfUnique();
				if (uniqueGen !== undefined) {
					columnPossibleGenerator.generator = uniqueGen;
				}

				// selecting version of generator
				columnPossibleGenerator.generator = this.selectVersionOfGenerator(columnPossibleGenerator.generator);

				// TODO: for now only GenerateValuesFromArray support notNull property
				columnPossibleGenerator.generator.notNull = col.notNull;
				columnPossibleGenerator.generator.dataType = col.dataType;
				columnPossibleGenerator.generator.stringLength = col.typeParams.length;

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
			// newGenerator.baseColumnDataType = oldGenerator.baseColumnDataType;

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
		newGenerator.baseColumnDataType = generator.baseColumnDataType;
		newGenerator.isUnique = generator.isUnique;
		// TODO: for now only GenerateValuesFromArray support notNull property
		newGenerator.notNull = generator.notNull;
		newGenerator.dataType = generator.dataType;
		newGenerator.stringLength = generator.stringLength;

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

	// TODO: revise serial part generators
	selectGeneratorForPostgresColumn = (
		table: Table,
		col: Column,
	) => {
		const pickGenerator = (table: Table, col: Column) => {
			// ARRAY
			if (col.columnType.match(/\[\w*]/g) !== null && col.baseColumn !== undefined) {
				const baseColumnGen = this.selectGeneratorForPostgresColumn(
					table,
					col.baseColumn!,
				) as AbstractGenerator;
				if (baseColumnGen === undefined) {
					throw new Error(`column with type ${col.baseColumn!.columnType} is not supported for now.`);
				}

				// const getBaseColumnDataType = (baseColumn: Column) => {
				// 	if (baseColumn.baseColumn !== undefined) {
				// 		return getBaseColumnDataType(baseColumn.baseColumn);
				// 	}

				// 	return baseColumn.dataType;
				// };
				// const baseColumnDataType = getBaseColumnDataType(col.baseColumn);

				const generator = new generatorsMap.GenerateArray[0]({ baseColumnGen, size: col.size });
				// generator.baseColumnDataType = baseColumnDataType;

				return generator;
			}

			// ARRAY for studio
			if (col.columnType.match(/\[\w*]/g) !== null) {
				// remove dimensions from type
				const baseColumnType = col.columnType.replace(/\[\w*]/g, '');
				const baseColumn: Column = {
					...col,
				};
				baseColumn.columnType = baseColumnType;

				const baseColumnGen = this.selectGeneratorForPostgresColumn(table, baseColumn) as AbstractGenerator;
				if (baseColumnGen === undefined) {
					throw new Error(`column with type ${col.baseColumn!.columnType} is not supported for now.`);
				}

				let generator = new generatorsMap.GenerateArray[0]({ baseColumnGen });

				for (let i = 0; i < col.typeParams.dimensions! - 1; i++) {
					generator = new generatorsMap.GenerateArray[0]({ baseColumnGen: generator });
				}

				return generator;
			}

			// INT ------------------------------------------------------------------------------------------------------------
			if (
				(col.columnType.includes('serial')
					|| col.columnType === 'integer'
					|| col.columnType === 'smallint'
					|| col.columnType.includes('bigint'))
				&& table.primaryKeys.includes(col.name)
			) {
				const generator = new generatorsMap.GenerateIntPrimaryKey[0]();

				return generator;
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
					} else {
						// if (col.dataType === 'number')
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
				const generator = new generatorsMap.GenerateInt[0]({
					minValue,
					maxValue,
				});

				return generator;
			}

			if (col.columnType.includes('serial')) {
				const generator = new generatorsMap.GenerateIntPrimaryKey[0]();

				generator.maxValue = maxValue;

				return generator;
			}

			// NUMBER(real, double, decimal, numeric)
			if (
				col.columnType.startsWith('real')
				|| col.columnType.startsWith('double precision')
				|| col.columnType.startsWith('decimal')
				|| col.columnType.startsWith('numeric')
			) {
				if (col.typeParams.precision !== undefined) {
					const precision = col.typeParams.precision;
					const scale = col.typeParams.scale === undefined ? 0 : col.typeParams.scale;

					const maxAbsoluteValue = Math.pow(10, precision - scale) - Math.pow(10, -scale);
					const generator = new generatorsMap.GenerateNumber[0]({
						minValue: -maxAbsoluteValue,
						maxValue: maxAbsoluteValue,
						precision: Math.pow(10, scale),
					});
					return generator;
				}
				const generator = new generatorsMap.GenerateNumber[0]();

				return generator;
			}

			// STRING
			if (
				(col.columnType === 'text'
					|| col.columnType.startsWith('varchar')
					|| col.columnType.startsWith('char'))
				&& table.primaryKeys.includes(col.name)
			) {
				const generator = new generatorsMap.GenerateUniqueString[0]();

				return generator;
			}

			if (
				(col.columnType === 'text'
					|| col.columnType.startsWith('varchar')
					|| col.columnType.startsWith('char'))
				&& col.name.toLowerCase().includes('name')
			) {
				const generator = new generatorsMap.GenerateFirstName[0]();

				return generator;
			}

			if (
				(col.columnType === 'text'
					|| col.columnType.startsWith('varchar')
					|| col.columnType.startsWith('char'))
				&& col.name.toLowerCase().includes('email')
			) {
				const generator = new generatorsMap.GenerateEmail[0]();

				return generator;
			}

			if (
				col.columnType === 'text'
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('char')
			) {
				const generator = new generatorsMap.GenerateString[0]();

				return generator;
			}

			// UUID
			if (col.columnType === 'uuid') {
				const generator = new generatorsMap.GenerateUUID[0]();

				return generator;
			}

			// BOOLEAN
			if (col.columnType === 'boolean') {
				const generator = new generatorsMap.GenerateBoolean[0]();

				return generator;
			}

			// DATE, TIME, TIMESTAMP
			if (col.columnType.includes('date')) {
				const generator = new generatorsMap.GenerateDate[0]();

				return generator;
			}

			if (col.columnType === 'time') {
				const generator = new generatorsMap.GenerateTime[0]();

				return generator;
			}

			if (col.columnType.includes('timestamp')) {
				const generator = new generatorsMap.GenerateTimestamp[0]();

				return generator;
			}

			// JSON, JSONB
			if (col.columnType === 'json' || col.columnType === 'jsonb') {
				const generator = new generatorsMap.GenerateJson[0]();

				return generator;
			}

			// if (col.columnType === "jsonb") {
			//   const generator = new GenerateJsonb({});
			//   return generator;
			// }

			// ENUM
			if (col.enumValues !== undefined) {
				const generator = new generatorsMap.GenerateEnum[0]({
					enumValues: col.enumValues,
				});

				return generator;
			}

			// INTERVAL
			if (col.columnType.startsWith('interval')) {
				if (col.columnType === 'interval') {
					const generator = new generatorsMap.GenerateInterval[0]();

					return generator;
				}

				const fields = col.columnType.replace('interval ', '') as GenerateInterval['params']['fields'];
				const generator = new generatorsMap.GenerateInterval[0]({ fields });

				return generator;
			}

			// POINT, LINE
			if (col.columnType.includes('point')) {
				const generator = new generatorsMap.GeneratePoint[0]();

				return generator;
			}

			if (col.columnType.includes('line')) {
				const generator = new generatorsMap.GenerateLine[0]();

				return generator;
			}

			if (col.hasDefault && col.default !== undefined) {
				const generator = new generatorsMap.GenerateDefault[0]({
					defaultValue: col.default,
				});
				return generator;
			}

			return;
		};

		const generator = pickGenerator(table, col);
		if (generator !== undefined) {
			generator.isUnique = col.isUnique;
			generator.dataType = col.dataType;
			generator.stringLength = col.typeParams.length;
		}

		return generator;
	};

	selectGeneratorForMysqlColumn = (
		table: Table,
		col: Column,
	) => {
		const pickGenerator = (table: Table, col: Column) => {
			// INT ------------------------------------------------------------------------------------------------------------
			if (
				(col.columnType.includes('serial') || col.columnType.includes('int'))
				&& table.primaryKeys.includes(col.name)
			) {
				const generator = new generatorsMap.GenerateIntPrimaryKey[0]();
				return generator;
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
				const generator = new generatorsMap.GenerateInt[0]({
					minValue,
					maxValue,
				});
				return generator;
			}

			if (col.columnType.includes('serial')) {
				const generator = new generatorsMap.GenerateIntPrimaryKey[0]();
				generator.maxValue = maxValue;
				return generator;
			}

			// NUMBER(real, double, decimal, float)
			if (
				col.columnType.startsWith('real')
				|| col.columnType.startsWith('double')
				|| col.columnType.startsWith('decimal')
				|| col.columnType.startsWith('float')
				|| col.columnType.startsWith('numeric')
			) {
				if (col.typeParams.precision !== undefined) {
					const precision = col.typeParams.precision;
					const scale = col.typeParams.scale === undefined ? 0 : col.typeParams.scale;

					const maxAbsoluteValue = Math.pow(10, precision - scale) - Math.pow(10, -scale);
					const generator = new generatorsMap.GenerateNumber[0]({
						minValue: -maxAbsoluteValue,
						maxValue: maxAbsoluteValue,
						precision: Math.pow(10, scale),
					});
					return generator;
				}

				const generator = new generatorsMap.GenerateNumber[0]();
				return generator;
			}

			// STRING
			if (
				(col.columnType === 'text'
					|| col.columnType === 'blob'
					|| col.columnType.startsWith('char')
					|| col.columnType.startsWith('varchar')
					|| col.columnType.startsWith('binary')
					|| col.columnType.startsWith('varbinary'))
				&& table.primaryKeys.includes(col.name)
			) {
				const generator = new generatorsMap.GenerateUniqueString[0]();
				return generator;
			}

			if (
				(col.columnType === 'text'
					|| col.columnType === 'blob'
					|| col.columnType.startsWith('char')
					|| col.columnType.startsWith('varchar')
					|| col.columnType.startsWith('binary')
					|| col.columnType.startsWith('varbinary'))
				&& col.name.toLowerCase().includes('name')
			) {
				const generator = new generatorsMap.GenerateFirstName[0]();
				return generator;
			}

			if (
				(col.columnType === 'text'
					|| col.columnType === 'blob'
					|| col.columnType.startsWith('char')
					|| col.columnType.startsWith('varchar')
					|| col.columnType.startsWith('binary')
					|| col.columnType.startsWith('varbinary'))
				&& col.name.toLowerCase().includes('email')
			) {
				const generator = new generatorsMap.GenerateEmail[0]();
				return generator;
			}

			if (
				col.columnType === 'text'
				|| col.columnType === 'blob'
				|| col.columnType.startsWith('char')
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('binary')
				|| col.columnType.startsWith('varbinary')
			) {
				const generator = new generatorsMap.GenerateString[0]();
				return generator;
			}

			// BOOLEAN
			if (col.columnType === 'boolean') {
				const generator = new generatorsMap.GenerateBoolean[0]();
				return generator;
			}

			// DATE, TIME, TIMESTAMP, DATETIME, YEAR
			if (col.columnType.includes('datetime')) {
				const generator = new generatorsMap.GenerateDatetime[0]();
				return generator;
			}

			if (col.columnType.includes('date')) {
				const generator = new generatorsMap.GenerateDate[0]();
				return generator;
			}

			if (col.columnType === 'time') {
				const generator = new generatorsMap.GenerateTime[0]();
				return generator;
			}

			if (col.columnType.includes('timestamp')) {
				const generator = new generatorsMap.GenerateTimestamp[0]();
				return generator;
			}

			if (col.columnType === 'year') {
				const generator = new generatorsMap.GenerateYear[0]();
				return generator;
			}

			// JSON
			if (col.columnType === 'json') {
				const generator = new generatorsMap.GenerateJson[0]();
				return generator;
			}

			// ENUM
			if (col.enumValues !== undefined) {
				const generator = new generatorsMap.GenerateEnum[0]({
					enumValues: col.enumValues,
				});
				return generator;
			}

			if (col.hasDefault && col.default !== undefined) {
				const generator = new generatorsMap.GenerateDefault[0]({
					defaultValue: col.default,
				});
				return generator;
			}

			return;
		};

		const generator = pickGenerator(table, col);

		return generator;
	};

	selectGeneratorForSqlite = (
		table: Table,
		col: Column,
	) => {
		const pickGenerator = (table: Table, col: Column) => {
			// int section ---------------------------------------------------------------------------------------
			if (
				(col.columnType === 'integer' || col.columnType === 'numeric')
				&& table.primaryKeys.includes(col.name)
			) {
				const generator = new generatorsMap.GenerateIntPrimaryKey[0]();
				return generator;
			}

			if (col.columnType === 'integer' && col.dataType === 'boolean') {
				const generator = new generatorsMap.GenerateBoolean[0]();
				return generator;
			}

			if ((col.columnType === 'integer' && col.dataType === 'date')) {
				const generator = new generatorsMap.GenerateTimestamp[0]();
				return generator;
			}

			if (
				col.columnType === 'integer'
				|| (col.dataType === 'bigint' && col.columnType === 'blob')
			) {
				const generator = new generatorsMap.GenerateInt[0]();
				return generator;
			}

			// number section ------------------------------------------------------------------------------------
			if (col.columnType.startsWith('real') || col.columnType.startsWith('numeric')) {
				if (col.typeParams.precision !== undefined) {
					const precision = col.typeParams.precision;
					const scale = col.typeParams.scale === undefined ? 0 : col.typeParams.scale;

					const maxAbsoluteValue = Math.pow(10, precision - scale) - Math.pow(10, -scale);
					const generator = new generatorsMap.GenerateNumber[0]({
						minValue: -maxAbsoluteValue,
						maxValue: maxAbsoluteValue,
						precision: Math.pow(10, scale),
					});
					return generator;
				}

				const generator = new generatorsMap.GenerateNumber[0]();
				return generator;
			}

			// string section ------------------------------------------------------------------------------------
			if (
				(col.columnType.startsWith('text')
					|| col.columnType.startsWith('numeric')
					|| col.columnType.startsWith('blob'))
				&& table.primaryKeys.includes(col.name)
			) {
				const generator = new generatorsMap.GenerateUniqueString[0]();
				return generator;
			}

			if (
				(col.columnType.startsWith('text')
					|| col.columnType.startsWith('numeric')
					|| col.columnType.startsWith('blob'))
				&& col.name.toLowerCase().includes('name')
			) {
				const generator = new generatorsMap.GenerateFirstName[0]();
				return generator;
			}

			if (
				(col.columnType.startsWith('text')
					|| col.columnType.startsWith('numeric')
					|| col.columnType.startsWith('blob'))
				&& col.name.toLowerCase().includes('email')
			) {
				const generator = new generatorsMap.GenerateEmail[0]();
				return generator;
			}

			if (
				col.columnType.startsWith('text')
				|| col.columnType.startsWith('numeric')
				|| col.columnType.startsWith('blob')
				|| col.columnType.startsWith('blobbuffer')
			) {
				const generator = new generatorsMap.GenerateString[0]();
				return generator;
			}

			if (
				(col.columnType.startsWith('text') && col.dataType === 'json')
				|| (col.columnType.startsWith('blob') && col.dataType === 'json')
			) {
				const generator = new generatorsMap.GenerateJson[0]();
				return generator;
			}

			if (col.hasDefault && col.default !== undefined) {
				const generator = new generatorsMap.GenerateDefault[0]({
					defaultValue: col.default,
				});
				return generator;
			}

			return;
		};

		const generator = pickGenerator(table, col);

		return generator;
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

			filteredTablesGenerators[idx]!.columnsPossibleGenerators = tableGen.columnsPossibleGenerators.filter((colGen) =>
				(colGen.isCyclic === true && colGen.wasDefinedBefore === true) || colGen.columnName === uniqueNotNullColName
			).map((colGen) => {
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
		db?:
			| PgDatabase<any>
			| MySqlDatabase<any, any>
			| BaseSQLiteDatabase<any, any>,
		schema?: { [key: string]: PgTable | MySqlTable | SQLiteTable },
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
					[columnName: string]: string | number | boolean | undefined;
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
			[columnName: string]: string | number | boolean | undefined;
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
							genObj = new generatorsMap.GenerateSelfRelationsValuesFromArray[0]({
								values: refColumnValues,
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
							genObj = new generatorsMap.GenerateValuesFromArray[0]({ values: refColumnValues });
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
		db?:
			| PgDatabase<any>
			| MySqlDatabase<any, any>
			| BaseSQLiteDatabase<any, any>;
		schema?: { [key: string]: PgTable | MySqlTable | SQLiteTable };
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

			// const arrayGen = columnsGenerators[columnName]!.replaceIfArray({ count, seed: columnGenerator.pRNGSeed });
			// if (arrayGen !== undefined) {
			// 	columnsGenerators[columnName] = arrayGen;
			// }

			// const uniqueGen = columnsGenerators[columnName]!.replaceIfUnique({ count, seed: columnGenerator.pRNGSeed });
			// if (uniqueGen !== undefined) {
			// 	columnsGenerators[columnName] = uniqueGen;
			// }
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
			(insertDataInDb === true || updateDataInDb === true)
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
				(insertDataInDb === true || updateDataInDb === true)
				&& ((i + 1) % batchSize === 0 || i === count - 1)
			) {
				if (preserveData === false) {
					if (insertDataInDb === true) {
						await this.insertInDb({
							generatedValues,
							db: db as
								| PgDatabase<any, any>
								| MySqlDatabase<any, any>
								| BaseSQLiteDatabase<any, any>,
							schema: schema as {
								[key: string]: PgTable | MySqlTable | SQLiteTable;
							},
							tableName: tableName as string,
							override,
						});
					} else if (updateDataInDb === true) {
						await this.updateDb({
							generatedValues,
							db: db as
								| PgDatabase<any, any>
								| MySqlDatabase<any, any>
								| BaseSQLiteDatabase<any, any>,
							schema: schema as {
								[key: string]: PgTable | MySqlTable | SQLiteTable;
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
							db: db as
								| PgDatabase<any, any>
								| MySqlDatabase<any, any>
								| BaseSQLiteDatabase<any, any>,
							schema: schema as {
								[key: string]: PgTable | MySqlTable | SQLiteTable;
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
							db: db as
								| PgDatabase<any, any>
								| MySqlDatabase<any, any>
								| BaseSQLiteDatabase<any, any>,
							schema: schema as {
								[key: string]: PgTable | MySqlTable | SQLiteTable;
							},
							tableName: tableName as string,
							uniqueNotNullColName: uniqueNotNullColName as string,
						});
					}
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
			| PgDatabase<any, any>
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

	updateDb = async ({
		generatedValues,
		db,
		schema,
		tableName,
		uniqueNotNullColName,
	}: {
		generatedValues: {
			[columnName: string]: number | string | boolean | undefined;
		}[];
		db:
			| PgDatabase<any, any>
			| MySqlDatabase<any, any>
			| BaseSQLiteDatabase<any, any>;
		schema: {
			[key: string]: PgTable | MySqlTable | SQLiteTable;
		};
		tableName: string;
		uniqueNotNullColName: string;
	}) => {
		if (is(db, PgDatabase<any>)) {
			const table = (schema as { [key: string]: PgTableWithColumns<any> })[tableName]!;
			const uniqueNotNullCol = table[uniqueNotNullColName];
			await db.update(table).set(generatedValues[0]!).where(
				eq(uniqueNotNullCol, generatedValues[0]![uniqueNotNullColName]),
			);
		} else if (is(db, MySqlDatabase<any, any>)) {
			const table = (schema as { [key: string]: MySqlTableWithColumns<any> })[tableName]!;
			await db.update(table).set(generatedValues[0]!).where(
				eq(table[uniqueNotNullColName], generatedValues[0]![uniqueNotNullColName]),
			);
		} else if (is(db, BaseSQLiteDatabase<any, any>)) {
			const table = (schema as { [key: string]: SQLiteTableWithColumns<any> })[tableName]!;
			await db.update(table).set(generatedValues[0]!).where(
				eq(table[uniqueNotNullColName], generatedValues[0]![uniqueNotNullColName]),
			);
		}
	};
}
