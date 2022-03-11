import { fromJson } from "./sqlgenerator";
import { applyJsonDiff, diffForRenamedTables, diffForRenamedColumn } from "./jsonDiffer";
import { object, string, boolean, mixed } from 'yup';

import {
  JsonRenameColumnStatement,
  prepareAddValuesToEnumJson,
  prepareAlterTableColumnsJson,
  prepareCreateEnumJson,
  prepareCreateIndexesJson,
  prepareCreateReferencesJson,
  prepareCreateTableJson,
  prepareDropIndexesJson,
  prepareDropTableJson,
  prepareRenameColumns,
  prepareRenameTableJson
} from "./jsonStatements";

export interface Column {
  name: string;
  type: string;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
  notNull?: boolean;
  references?: {
    table: string;
    column: string;
    foreignKeyName: string;
    onDelete?: string;
    onUpdate?: string;
  };
}

const columnSchema = object({
  name: string().required(),
  type: string().required(),
  primaryKey: boolean().optional(),
  unique: boolean().optional(),
  defaultValue: mixed().optional(),
  notNull: boolean().optional(),
  references: object({
    table: string().required(),
    column: string().required(),
    foreignKeyName: string().required(),
    onDelete: string().optional(),
    onUpdate: string().optional(),
  }).optional()
}).noUnknown()

export interface Added<T> {
  type: 'added';
  value: T;
}

export interface Deleted<T> {
  type: 'deleted';
  value: T;
}

export interface Changed<T> {
  type: 'changed';
  old: T;
  new: T;
}

export type PatchedProperty<T> = Added<T> | Deleted<T> | Changed<T>;

export interface AlteredColumn {
  name: string | Changed<string>
  type?: Changed<string>
  defaultValue?: PatchedProperty<string>,
  notNull?: PatchedProperty<boolean>
}

export interface ColumnsObject {
  [name: string]: Column;
}

interface Enum {
  name: string;
  values: string[];
}

export interface Index {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface Table {
  name: string;
  columns: ColumnsObject,
  indexes: Index[]
}

export interface AlteredTable {
  name: string;
  deleted: Column[];
  added: Column[],
  altered: AlteredColumn[],
  addedIndexes: Index[],
  deletedIndexes: Index[],

}

export type DiffResult = {
  addedTables: Table[]
  deletedTables: Table[]
  alteredTablesWithColumns: AlteredTable[]
  addedEnums: Enum[]
  deletedEnums: Enum[]
  alteredEnums: any[]
}

export interface TablesResolverInput<T extends { name: string }> {
  created: T[],
  deleted: T[]
}
export interface TablesResolverOutput<T extends { name: string }> {
  created: T[],
  renamed: { from: T, to: T }[],
  deleted: T[]
}

export interface ColumnsResolverInput<T extends { name: string }> {
  tableName: string,
  created: T[],
  deleted: T[]
}

export interface ColumnsResolverOutput<T extends { name: string }> {
  tableName: string,
  created: T[],
  renamed: { from: T, to: T }[],
  deleted: T[]
}

export const applySnapshotsDiff = async (
  json1: Object,
  json2: Object,
  tablesResolver: (input: TablesResolverInput<Table>) => Promise<TablesResolverOutput<Table>>,
  columnsResolver: (input: ColumnsResolverInput<Column>) => Promise<ColumnsResolverOutput<Column>>
) => {
  const diffResult = applyJsonDiff(json1, json2)

  const typedResult: DiffResult = diffResult

  typedResult.addedTables.forEach(t => {
    Object.values(t.columns).forEach(column => {
      columnSchema.validateSync(column, { strict: true })
    })
  })

  typedResult.deletedTables.forEach(t => {
    Object.values(t.columns).forEach(column => {
      columnSchema.validateSync(column, { strict: true })
    })
  })

  typedResult.alteredTablesWithColumns.forEach(t => {
    t.added.forEach(column => {
      columnSchema.validateSync(column, { strict: true })
    })
    t.deleted.forEach(column => {
      columnSchema.validateSync(column, { strict: true })
    })
  })


  const { created, deleted, renamed } = await tablesResolver({ created: typedResult.addedTables, deleted: typedResult.deletedTables })

  const jsonStatements: any[] = []
  const jsonCreateTables = created.map(it => {
    return prepareCreateTableJson(it)
  })

  const jsonCreateIndexesForCreatedTables = created.map(it => {
    return prepareCreateIndexesJson(it.name, it.indexes)
  }).flat()

  const jsonDropTables = deleted.map(it => {
    return prepareDropTableJson(it)
  })

  const jsonRenameTables = renamed.map(it => {
    return prepareRenameTableJson(it.from, it.to)
  })

  const renamedWithAlternations: AlteredTable[] = diffForRenamedTables(renamed)
  const allAltered = typedResult.alteredTablesWithColumns.concat(renamedWithAlternations)

  const jsonRenameColumnsStatements: JsonRenameColumnStatement[] = []

  const allAlteredResolved: AlteredTable[] = []
  for (const table of allAltered) {
    const result = await columnsResolver({ tableName: table.name, created: table.added, deleted: table.deleted });
    // prepare oldTable and newTable

    jsonRenameColumnsStatements.push(...prepareRenameColumns(table.name, result.renamed))

    const renamedColumnsAltered: AlteredColumn[] = result.renamed.map(it => diffForRenamedColumn(it.from, it.to))
    const allAltered = table.altered.concat(renamedColumnsAltered)

    const resolved: AlteredTable = {
      name: table.name,
      deleted: result.deleted,
      added: result.created,
      altered: allAltered,
      addedIndexes: table.addedIndexes,
      deletedIndexes: table.deletedIndexes
    }

    allAlteredResolved.push(resolved)
  }

  const jsonAlterTables = allAlteredResolved.map(it => {
    return prepareAlterTableColumnsJson(it.name, it.deleted, it.added, it.altered)
  }).flat()

  const jsonCreateIndexesForAllAlteredTables = allAltered.map(it => {
    return prepareCreateIndexesJson(it.name, it.addedIndexes || {})
  }).flat()

  const jsonDropIndexesForAllAlteredTables = allAltered.map(it => {
    return prepareDropIndexesJson(it.name, it.deletedIndexes || {})
  }).flat()

  const jsonCreateReferencesForCreatedTables = created.map(it => {
    return prepareCreateReferencesJson(it.name, Object.values(it.columns))
  }).flat()

  const jsonCreateReferencesForAllAlteredTables = allAltered.map(it => {
    return prepareCreateReferencesJson(it.name, it.added)
  }).flat()

  const jsonCreateReferences = jsonCreateReferencesForCreatedTables.concat(jsonCreateReferencesForAllAlteredTables)

  // // Enums:
  // // - создание енама ✅
  // // - переименование енама (пока не делаю)⏳
  // // - добавление вэлью к енаму ✅
  // // - ренейм вейлью у енама (пока не делаю, это надо запрашивать опять же через слай)⏳
  // // - удаление енама -> чекать не используется ли где-то енам и сначала ранить миграции и в самом конце удаление енама⏳
  // // - удаление вэлью из енама -> блок ❌
  // const enums = result.addedEnums.map(it => {
  //   return prepareCreateEnum(it.name, it.values)
  // })

  const createEnums = diffResult.addedEnums.map(it => {
    return prepareCreateEnumJson(it.name, it.values)
  })

  //todo: block enum rename, enum value rename and enun deletion for now
  const jsonAlterEnumsWithAddedValues = diffResult.alteredEnums.map(it => {
    return prepareAddValuesToEnumJson(it.name, it.addedValues)
  }).flat()

  jsonStatements.push(...createEnums)
  jsonStatements.push(...jsonAlterEnumsWithAddedValues)
  jsonStatements.push(...jsonCreateTables)
  jsonStatements.push(...jsonDropTables)
  jsonStatements.push(...jsonRenameTables)
  jsonStatements.push(...jsonRenameColumnsStatements)
  jsonStatements.push(...jsonAlterTables)
  jsonStatements.push(...jsonCreateReferences)
  jsonStatements.push(...jsonCreateIndexesForCreatedTables)
  jsonStatements.push(...jsonCreateIndexesForAllAlteredTables)
  jsonStatements.push(...jsonDropIndexesForAllAlteredTables)

  const sqlStatements = fromJson(jsonStatements)
  return sqlStatements.join('\n')
}

// explicitely ask if tables were renamed, if yes - add those to altered tables, otherwise - deleted
// double check if user wants to delete particular table and warn him on data loss
