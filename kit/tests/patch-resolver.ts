import { Named } from "../src/cli/components-api"
import { Patch } from "./utils";

declare global {
    interface Array<T> {
        exactlyOne(): T;
    }
}

Array.prototype.exactlyOne = function () {
    if (this.length !== 1) {
        return undefined
    }
    return this[0]
}

export class PatchResolver {
    constructor(private readonly config: Patch) { 
    }

    resolveTables<T extends Named>(added: T[], deleted: T[]) {
        return applyPatch(added, deleted, this.config.tables.sequence)
    }

    resolveColumns<T extends Named>(tableName: string, added: T[], deleted: T[]) {
        const resolved = applyPatch(added, deleted, this.config.columns_in_tables[tableName].sequence)
        return { tableName, ...resolved }
    }
}

const applyPatch = <T extends Named>(added: T[], missing: T[], seq: string[]) => {
    const created: T[] = []
    const deleted: T[] = []
    const renamed: { from: T, to: T }[] = []

    for (const item of seq) {
        const split = item.split('-', 2)
        const idx0: number = Number(split[0])
        const idx1: number = Number(split[0])
        if (split[0] && split[1]) {
            // rename
            const renameFrom = missing[idx0]
            const renameTo = added[idx1]
            renamed.push({ from: renameFrom, to: renameTo })
        } else if (split[0]) {
            // delete
            deleted.push(missing[idx0])
        } else if (split[1]) {
            // create
            created.push(added[idx1])
        }
    }
    return { created, deleted, renamed }
}