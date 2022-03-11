import { task, promptTablesConflicts, promptColumnsConflicts } from '../components-api';
import fs from 'fs';
import yaml from 'js-yaml'
import prepareMigration from '../../migrationPreparator';
import { applySnapshotsDiff, Column, ColumnsResolverInput, ColumnsResolverOutput, Table, TablesResolverInput, TablesResolverOutput } from '../../snapshotsDiffer';

export interface Config {
  dataFolder: string;
  migrationRootFolder?: string;
}

export const prepareAndMigrate = async () => {
  const drizzleConfig: Config = yaml.load(fs.readFileSync('drizzle.config.yml', { encoding: 'utf-8' })) as Config;
  const migrationRootFolder = drizzleConfig.migrationRootFolder || 'drizzle' // or from config/params
  const dataFolder = drizzleConfig.dataFolder

  try {
    const { prev, cur } = await prepareJsonSnapshots(migrationRootFolder, dataFolder)
    freeeeeeze(prev);
    freeeeeeze(cur);
    const sql = await prepareSQL(prev, cur)
    // todo: save results to a new migration folder
    const folderName = prepareSnapshotFolderName()
    const migrationFolderPath = `./${migrationRootFolder}/${folderName}`
    fs.mkdirSync(migrationFolderPath)
    fs.writeFileSync(`${migrationFolderPath}/snapshot.json`, JSON.stringify(cur, null, 2))
    fs.writeFileSync(`${migrationFolderPath}/migration.sql`, sql)
  } catch (e) {
    console.error(e)
  }
}

const freeeeeeze = (obj: any) => {
  Object.freeze(obj)
  for (let key in obj) {
    if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
      freeeeeeze(obj[key]);
    }
  }
}

const prepareJsonSnapshots = async (migrationRootFolder: string, dataFolder: string) => {
  return await task('Preparing data schema json snapshot', async ({ setTitle }) => {
    return prepareMigration(migrationRootFolder, dataFolder)
  });
}

export const prepareSQL = async (prev: object, cur: object) => {
  const tablesResolver = async (input: TablesResolverInput<Table>): Promise<TablesResolverOutput<Table>> => {
    try {
      const { created, deleted, renamed } = await promptTablesConflicts({
        newTables: input.created,
        missingTables: input.deleted,
      })

      return { created: created, deleted: deleted, renamed: renamed };

    } catch (e) {
      console.error(e)
      throw e
    }
  }

  const columnsResolver = async (input: ColumnsResolverInput<Column>): Promise<ColumnsResolverOutput<Column>> => {
    const result = await promptColumnsConflicts({ name: input.tableName, added: input.created, deleted: input.deleted })
    return { tableName: input.tableName, created: result.created, deleted: result.deleted, renamed: result.renamed }
  }

  return await applySnapshotsDiff(prev, cur, tablesResolver, columnsResolver);
};

const prepareSnapshotFolderName = () => {
  const now = new Date()
  return `${now.getFullYear()}${two(now.getUTCMonth() + 1)}${two(now.getUTCDate())}${two(now.getUTCHours())}${two(now.getUTCMinutes())}${two(now.getUTCSeconds())}`
}

const two = (input: number): string => {
  return input.toString().padStart(2, '0')
}
