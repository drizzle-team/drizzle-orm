import fs from 'fs'
import { resolveColumns, resolveTables } from './simulator'
import {
    applySnapshotsDiff,
    Column,
    ColumnsResolverInput,
    ColumnsResolverOutput,
    Table,
    TablesResolverInput,
    TablesResolverOutput
} from './snapshotsDiffer'

export const dry = {
    version: "1",
    tables: {},
    enums: {}
}

const simulatedTablesResolver = async (input: TablesResolverInput<Table>): Promise<TablesResolverOutput<Table>> => {
    return resolveTables(input.created, input.deleted)
}

const simulatedColumnsResolver = async (input: ColumnsResolverInput<Column>): Promise<ColumnsResolverOutput<Column>> => {
    return resolveColumns(input.tableName, input.created, input.deleted)
}



// const j3 = JSON.parse(fs.readFileSync('./out/1634215063491.json', 'utf8'))
const main = async () => {
    // const j1 = dry
    const j1 = JSON.parse(fs.readFileSync('./out/leha1.json', 'utf8'))
    const j2 = JSON.parse(fs.readFileSync('./out/leha2.json', 'utf8'))
    console.log(await applySnapshotsDiff(j1, j2, simulatedTablesResolver, simulatedColumnsResolver))
}

// main()