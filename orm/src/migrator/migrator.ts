/* eslint-disable no-restricted-syntax */
/* eslint-disable import/export */
/* eslint-disable max-classes-per-file */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Create } from '../builders';
import Transaction from '../builders/transaction/transaction';
import Db from '../db/db';
import { MigrationsTable } from '../tables';
import Order from '../builders/highLvlBuilders/order';

export type InCodeConfig = { migrationFolder: string };

export default class Migrator {
  public constructor(private db: Db) {
  }

  public async migrate(configPath: string): Promise<void>
  public async migrate(config: InCodeConfig): Promise<void>
  public async migrate(configPath?: unknown) {
    let migrationFolderTo: string | undefined;
    if (typeof configPath === 'string') {
      const configAsString = fs.readFileSync(path.resolve('.', configPath), 'utf8');
      const splitted = configAsString.trim().split('\n');
      // eslint-disable-next-line no-restricted-syntax
      for (const split of splitted) {
        const entry = split.trim().split(':');
        const key = entry[0];
        const value = entry[1].trim().replace(/['"]+/g, '');

        if (key === 'migrationRootFolder') {
          // proceed value
          migrationFolderTo = value;
        }
      }
    } else {
      migrationFolderTo = (configPath as InCodeConfig).migrationFolder;
    }

    if (!migrationFolderTo) {
      throw Error('no migration folder defined');
    }

    const migrationTable = new MigrationsTable(this.db);

    await this.db.session().execute(Create.table(migrationTable).build());

    const dbMigrations = await migrationTable.select()
      .limit(1)
      .orderBy((table) => table.createdAt, Order.DESC)
      .all();

    const lastDbMigration = dbMigrations[0];
    console.log('Last migration in database: ', lastDbMigration.hash);

    const files = fs.readdirSync(migrationFolderTo);
    const transaction = new Transaction(this.db.session());
    await transaction.begin();

    try {
      for await (const migrationFolder of files) {
        const migrationFiles = fs.readdirSync(`${migrationFolderTo}/${migrationFolder}`);
        const migrationFile = migrationFiles.filter((file) => file === 'migration.sql')[0];

        const query = fs.readFileSync(`${migrationFolderTo}/${migrationFolder}/${migrationFile}`).toString();

        const year = Number(migrationFolder.slice(0, 4));
        // second param for Date() is month index, that started from 0, so we need
        // to decrement a value for month
        const month = Number(migrationFolder.slice(4, 6)) - 1;
        const day = Number(migrationFolder.slice(6, 8));
        const hour = Number(migrationFolder.slice(8, 10));
        const min = Number(migrationFolder.slice(10, 12));
        const sec = Number(migrationFolder.slice(12, 14));

        const folderAsMillis = new Date(year, month, day, hour, min, sec).getTime();
        console.log(`Check if migration ${migrationFolder} should be executed.`);
        console.log(`Folder name to millis = ${folderAsMillis}`);
        if (!lastDbMigration || lastDbMigration.createdAt! < folderAsMillis) {
          console.log(`Executing ${migrationFolder} migration`);
          await this.db.session().execute(query);
          await migrationTable.insert({
            hash: this.generateHash(query),
            createdAt: folderAsMillis,
          }).execute();
        }
      }

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }

  private generateHash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
