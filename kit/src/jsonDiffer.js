'use-strict';

import { diff } from 'json-diff'

export function diffForRenamedTables(pairs) {
    // raname table1 to name of table2, so we can apply diffs
    const renamed = pairs.map(it => {
        const from = it.from
        const to = it.to
        const newFrom = { ...from, name: to.name }
        return [newFrom, to]
    })

    // find any alternations made to a renamed table
    const altered = renamed.map(pair => {
        return diffForRenamedTable(pair[0], pair[1])
    })

    return altered
}

export function diffForRenamedTable(t1, t2) {
    t1.name = t2.name
    const diffed = diff(t1, t2);
    diffed.name = t2.name

    return findAlternationsInTable(diffed)
}

export function diffForRenamedColumn(t1, t2) {
    const renamed = { ...t1, name: t2.name }
    const diffed = diff(renamed, t2) || {};
    diffed.name = t2.name

    return alternationsInColumn(diffed)
}

const renameNestedObjects = (obj, keyFrom, keyTo) => {
    Object.entries(obj).forEach(([key, value]) => {
        if ((key === keyFrom || (key.includes(keyFrom) && key !== keyFrom)) && 'object' !== typeof value) {
            const newKey = key.replace(keyFrom, keyTo)
            obj[newKey] = value;
            delete obj[key];
        }

        if ('object' === typeof value) {
            renameNestedObjects(obj[key], keyFrom, keyTo);
        }
    });
}

const update1to2 = (json) => {
    Object.entries(json).forEach(([key, val]) => {
        if ('object' !== typeof val) return

        if (val.hasOwnProperty('references')) {
            const ref = val['references']
            const fkName = ref['foreignKeyName']
            const table = ref['table']
            const column = ref['column']
            const onDelete = ref['onDelete']
            const onUpdate = ref['onUpdate']
            const newRef = `${fkName};${table};${column};${onDelete ?? ''};${onUpdate ?? ''}`
            val['references'] = newRef
        } else {
            update1to2(val)
        }
    })
}
const migrateSchema = (json) => {
    if (json['version'] === '1') {
        update1to2(json)
        json['version'] = '2'
    }
}

export function applyJsonDiff(json1, json2) {
    json1 = JSON.parse(JSON.stringify(json1))
    json2 = JSON.parse(JSON.stringify(json2))

    migrateSchema(json1)
    migrateSchema(json2)

    //deep copy, needed because of the bug in diff library
    const rawDiff = diff(json1, json2)
    const difference = rawDiff

    difference.tables = difference.tables ? difference.tables : {}
    difference.enums = difference.enums ? difference.enums : {}

    renameNestedObjects(difference, 'default', 'defaultValue')

    const tableEntries = Object.entries(difference.tables)
    const addedTables = tableEntries.filter(it => it[0].includes('__added'))
        .map(it => it[1])
        .map(it => {
            return {
                ...it, indexes: Object.entries(it.indexes).map(indexEntry => {
                    const idx = indexEntry[1]
                    const name = idx['name']
                    const columns = Object.values(idx['columns']).map(it => it['name'])
                    return { name, columns, isUnique: idx['isUnique'] }
                })
            }
        })

    const deletedTables = tableEntries.filter(it => it[0].includes('__deleted'))
        .map(it => it[1])

    const enumsEntries = Object.entries(difference.enums)

    const addedEnums = enumsEntries.filter(it => it[0].includes('__added'))
        .map(it => it[1])
        .map(it => {
            // values: { val1: 'val1', val2: 'val2' } => values: ['val1', 'val2']
            const values = Object.entries(it.values).map(ve => ve[1])
            return { name: it.name, values: values }
        })

    const deletedEnums = enumsEntries.filter(it => it[0].includes('__deleted'))
        .map(it => it[1])
        .map(it => {
            // values: { val1: 'val1', val2: 'val2' } => values: ['val1', 'val2']
            const values = Object.entries(it.values).map(ve => ve[1])
            return { name: it.name, values: values }
        })

    const alteredEnums = enumsEntries.filter(it => !(it[0].includes('__added') || it[0].includes('__deleted')))
        .map(it => {
            const vals = it[1].values
            const addedValues = Object.entries(vals).filter(val => val[0].includes('__added')).map(val => val[1])
            const deletedValues = Object.entries(vals).filter(val => val[0].includes('__deleted')).map(val => val[1])
            return { name: it[0], addedValues, deletedValues, }
        })

    const alteredTables = Object.keys(difference.tables)
        .filter(it => !(it.includes('__added') || it.includes('__deleted')))
        .map(it => {
            return { name: it, ...difference.tables[it] }
        })

    const alteredTablesWithColumns = alteredTables.map(table => findAlternationsInTable(table))

    return {
        addedTables,
        deletedTables,
        alteredTablesWithColumns,
        addedEnums,
        deletedEnums,
        alteredEnums,
    }
}

const findAlternationsInTable = (table) => {
    // map each table to have altered, deleted or renamed columns

    // in case no columns were altered, but indexes were
    const columns = table.columns ?? {};

    const added = Object.keys(columns).filter(it => it.includes('__added')).map(it => {
        return { ...columns[it] }
    })
    const deleted = Object.keys(columns).filter(it => it.includes('__deleted')).map(it => {
        return { ...columns[it] }
    })
    const altered = Object.keys(columns)
        .filter(it => !(it.includes('__deleted') || it.includes('__added')))
        .map(it => {
            return { name: it, ...columns[it] }
        })

    const deletedIndexes = Object.values(table.indexes__deleted || {}).map(it => {
        const name = it['name']
        const columns = Object.values(it['columns']).map(it => it['name'])
        return { name, columns, isUnique: it['isUnique'] }
    }).concat(
        Object.keys(table.indexes || {}).filter(it => it.includes('__deleted'))
            .map(it => {
                const idx = table.indexes[it]
                const name = idx['name']
                const columns = Object.values(idx['columns']).map(it => it['name'])
                return { name, columns, isUnique: idx['isUnique'] }
            })
    );

    const addedIndexes = Object.values(table.indexes__added || {}).map(it => {
        const name = it['name']
        const columns = Object.values(it['columns']).map(it => it['name'])
        return { name, columns, isUnique: idx['isUnique'] }
    }).concat(
        Object.keys(table.indexes || {}).filter(it => it.includes('__added'))
            .map(it => {
                const idx = table.indexes[it]
                const name = idx['name']
                const columns = Object.values(idx['columns']).map(it => it['name'])
                return { name, columns, isUnique: idx['isUnique'] }
            })
    );

    const mappedAltered = altered.map(it => alternationsInColumn(it))

    return { name: table.name, deleted, added, altered: mappedAltered, addedIndexes, deletedIndexes }
}

const alternationsInColumn = (column) => {
    const altered = [column]
    const result = altered.map(it => {
        if (typeof it.name !== 'string' && '__old' in it.name) {
            // rename
            return { ...it, name: { type: 'changed', old: it.name.__old, new: it.name.__new } }
        }
        return it
    }).map(it => {
        if ('type' in it) {
            // type change
            return { ...it, type: { type: 'changed', old: it.type.__old, new: it.type.__new } }
        }
        return it
    }).map(it => {
        if ('defaultValue' in it) {
            return { ...it, defaultValue: { type: 'changed', old: it.defaultValue.__old, new: it.defaultValue.__new } }
        }
        if ('defaultValue__added' in it) {
            const { defaultValue__added, ...others } = it
            return { ...others, defaultValue: { type: 'added', value: it.defaultValue__added } }
        }
        if ('defaultValue__deleted' in it) {
            const { defaultValue__deleted, ...others } = it
            return { ...others, defaultValue: { type: 'deleted', value: it.defaultValue__deleted } }
        }
        return it
    }).map(it => {
        if ('notNull' in it) {
            return { ...it, notNull: { type: 'changed', old: it.notNull.__old, new: it.notNull.__new } }
        }
        if ('notNull__added' in it) {
            const { notNull__added, ...others } = it
            return { ...others, notNull: { type: 'added', value: it.notNull__added } }
        }
        if ('notNull__deleted' in it) {
            const { notNull__deleted, ...others } = it
            return { ...others, notNull: { type: 'deleted', value: it.notNull__deleted } }
        }
        return it
    }).map(it => {
        if ('references' in it) {
            return { ...it, references: { type: 'changed', old: it.references.__old, new: it.references.__new } }
        }
        if ('references__added' in it) {
            const { references__added, ...others } = it
            return { ...others, references: { type: 'added', value: it.references__added } }
        }
        if ('references__deleted' in it) {
            const { references__deleted, ...others } = it
            return { ...others, references: { type: 'deleted', value: it.references__deleted } }
        }
        return it
    })
    return result[0]
}
