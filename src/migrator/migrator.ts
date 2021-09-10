/* eslint-disable import/export */
/* eslint-disable max-classes-per-file */
import Create from '../builders/lowLvlBuilders/create';
import Transaction from '../builders/transaction/transaction';
import Db from '../db/db';
import Session from '../db/session';
import {
  ExtractModel,
} from '../tables/inferTypes';
import MigrationsTable from '../tables/migrationsTable';

export class MigrationSession {
  private finalQuery = '';

  public execute = (query: string): void => {
    this.finalQuery += query;
    this.finalQuery += '\n';
  };

  public getQuery = (): string => this.finalQuery;
}

export default class Migrator {
  private _db: Db;
  private migrationsPerVersion: Map<number, string> = new Map();
  private session: Session;

  public constructor(db: Db) {
    this._db = db;
    this.session = db.session();
  }

  public chain = (tag: number,
    migration: (dbSession: MigrationSession) => void): Migrator => {
    const migrationSession = new MigrationSession();
    migration(migrationSession);
    this.migrationsPerVersion.set(+tag, migrationSession.getQuery());
    return this;
  };

  public getResultScript = (): string[] => {
    const values: string[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const value of this.migrationsPerVersion.values()) {
      values.push(value);
    }
    return values;
  };

  public execute = async (): Promise<boolean> => {
    const migrationsTable = new MigrationsTable(this._db);

    await this.session.execute(Create.table(migrationsTable).build());

    const migrations
    : Array<ExtractModel<MigrationsTable> | undefined> = await migrationsTable.select().all();

    const transaction = new Transaction(this.session);
    await transaction.begin();
    // eslint-disable-next-line no-restricted-syntax
    for await (const [key, value] of this.migrationsPerVersion) {
      const dbMigrationByTag = migrations.find((it) => it!.version === key);
      if (dbMigrationByTag) {
        // const isHashSameAsInDb =
        // Buffer.from(dbMigrationByTag.hash, 'base64').toString('ascii') === value;

        // if (!isHashSameAsInDb) {
        //   throw Error(`Migration script was changed for version ${key}`);
        // }
      } else {
        try {
          const logger = this._db.logger();
          if (logger) {
            logger.info(`Executing migration with tag ${key} with query:\n${value}`);
          }
          const result = await this._db.session().execute(value);
          if (result.isLeft()) {
            const { reason } = result.value;
            throw new Error(`Error while executing migration tag ${key}. Error: ${reason}`);
          } else {
            await migrationsTable
              .insert({
                version: key,
                createdAt: new Date(),
                hash: Buffer.from(value).toString('base64'),
              }).execute();
          }
        } catch (e) {
          await transaction.rollback();
          throw new Error(`Migration chain ${key} was not migrated sucessfully.\nMessage: ${e.message}`);
        }
      }
    }

    await transaction.commit();

    return true;
  };

  private generateHash(value: string): number {
    let hash = 0;
    let i;
    let chr;
    if (value.length === 0) return hash;
    for (i = 0; i < value.length; i += 1) {
      chr = value.charCodeAt(i);
      // eslint-disable-next-line no-bitwise
      hash = ((hash << 5) - hash) + chr;
      // eslint-disable-next-line no-bitwise
      hash |= 0;
    }
    return hash;
  }
}
