import fs from 'fs'
import serialize from './serializer'

// TODO: export as a function w

const dry = {
    version: "1",
    tables: {},
    enums: {}
}

const prepareMigration = (
    migrationRootFolderName: string = 'drizzle',
    dataFolderPath: string
): { prev: any, cur: any } => {
    const root = migrationRootFolderName
    const files = fs.readdirSync('./')
    const drizzleFolder = files.find((it) => {
        return it === root
    })

    if (!drizzleFolder) {
        fs.mkdirSync(root)
    }

    const migrationFolders = fs.readdirSync(`./${root}`)

    let prevSnapshot;

    if (migrationFolders.length === 0) {
        prevSnapshot = dry
    } else {
        migrationFolders.sort()
        const lastSnapshotFolder = migrationFolders[migrationFolders.length - 1]
        prevSnapshot = JSON.parse(fs.readFileSync(`./${root}/${lastSnapshotFolder}/snapshot.json`).toString())
    }


    const result = serialize(dataFolderPath)

    return { prev: prevSnapshot, cur: result }
}

export default prepareMigration;