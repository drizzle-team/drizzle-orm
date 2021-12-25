/* eslint-disable no-restricted-syntax */
/* eslint-disable import/export */
/* eslint-disable max-classes-per-file */
import * as fs from 'fs';
import { Create } from '../builders';
import Transaction from '../builders/transaction/transaction';
import Db from '../db/db';
import { MigrationsTable } from '../tables';

export type InCodeConfig = { migrationFolder: string };

export default class Migrator {
  public constructor(private db: Db) {
  }

  public async migrate(configPath: string): Promise<void>
  public async migrate(config: InCodeConfig): Promise<void>
  public async migrate(configPath?: any, config?: InCodeConfig): Promise<void> {
    let migrationFolderTo: string | undefined;
    if (configPath) {
      const configAsString = fs.readFileSync(configPath, 'utf8');
      const splitted = configAsString.trim().split('\n');
      // eslint-disable-next-line no-restricted-syntax
      for (const split of splitted) {
        const entry = split.trim().split(':');
        const key = entry[0];
        const value = entry[1].trim().replace(/['"]+/g, '');

        if (key === 'migrationFolder') {
          // proceed value
          migrationFolderTo = value;
        }
      }
    }

    if (config) {
      migrationFolderTo = config.migrationFolder;
    }

    if (!migrationFolderTo) {
      throw Error('no migration folder defined');
    }

    const migrationTable = new MigrationsTable(this.db);

    await this.db.session().execute(Create.table(migrationTable).build());

    const dbMigrations = await migrationTable.select().all();
    const lastDbMigration = dbMigrations.length > 0
      ? dbMigrations[dbMigrations.length - 1]
      : undefined;

    const files = fs.readdirSync(migrationFolderTo);
    const transaction = new Transaction(this.db.session());
    await transaction.begin();

    try {
      for await (const migrationFolder of files) {
        const migrationFiles = fs.readdirSync(`${migrationFolderTo}/${migrationFolder}`);
        const migrationFile = migrationFiles.filter((file) => file === 'migration.sql')[0];

        const query = fs.readFileSync(`${migrationFolderTo}/${migrationFolder}/${migrationFile}`).toString();

        const folderAsMillis = new Date(migrationFolder).getTime();
        if (!lastDbMigration || lastDbMigration.createdAt! < folderAsMillis) {
          await this.db.session().execute(query);
          await migrationTable.insert({
            hash: this.generateHash(query),
            createdAt: folderAsMillis,
          }).execute();
        }
      }

      await transaction.commit();
    } catch (e) {
      this.db.logger()!.error(e);
      transaction.rollback();
    }
  }

  private generateHash(value: string): string {
    let hash = 0;
    let i;
    let chr;
    if (value.length === 0) return '';
    for (i = 0; i < value.length; i += 1) {
      chr = value.charCodeAt(i);
      // eslint-disable-next-line no-bitwise
      hash = ((hash << 5) - hash) + chr;
      // eslint-disable-next-line no-bitwise
      hash |= 0;
    }
    return Buffer.from(value).toString('base64');
  }
}
