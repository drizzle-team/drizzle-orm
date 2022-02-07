import { PatchResolver } from "./patch-resolver";
import fs from 'fs'
import yaml from 'js-yaml'

import serializer from "../src/serializer/";
import { applySnapshotsDiff, Column, ColumnsResolverInput, ColumnsResolverOutput, Table, TablesResolverInput, TablesResolverOutput } from "../src/snapshotsDiffer";

const dry = {
    version: "1",
    tables: {},
    enums: {}
}

export interface Patch {
    tables: {
        removed: string[]
        added: string[],
        sequence: string[]
    },
    columns_in_tables: Record<string, { removed: string[], added: string[], sequence: string[] }>
}

export const prepareTestSQL = async (path: string) => {
    const fromExists = fs.existsSync(`${path}/from.ts`)
    const fromJson = fromExists ? serializer(path, 'from.ts') : dry

    if (!fs.existsSync(`${path}/to.ts`)) {
        console.error(`Missing to.ts in the ${path}`)
        process.exit()
    }

    const toJson = serializer(path, 'to.ts')
    const patch = yaml.load(fs.readFileSync(`${path}/_patch.yaml`).toString('utf-8')) as Patch

    const patchResolver = new PatchResolver(patch)

    const dryRunTablesResolver = async (input: TablesResolverInput<Table>): Promise<TablesResolverOutput<Table>> => {
        return { created: input.created, deleted: input.deleted, renamed: [] }
    }

    const dryRunColumnsResolver = async (input: ColumnsResolverInput<Column>): Promise<ColumnsResolverOutput<Column>> => {
        return { tableName: input.tableName, created: input.created, deleted: input.deleted, renamed: [] }
    }

    const simulatedTablesResolver = async (input: TablesResolverInput<Table>): Promise<TablesResolverOutput<Table>> => {
        return patchResolver.resolveTables(input.created, input.deleted)
    }

    const simulatedColumnsResolver = async (input: ColumnsResolverInput<Column>): Promise<ColumnsResolverOutput<Column>> => {
        return patchResolver.resolveColumns(input.tableName, input.created, input.deleted)
    }
    const initSQL = await applySnapshotsDiff(dry, fromJson, dryRunTablesResolver, dryRunColumnsResolver)
    const migrationSQL = await applySnapshotsDiff(fromJson, toJson, simulatedTablesResolver, simulatedColumnsResolver)
    return { initSQL, migrationSQL }
}