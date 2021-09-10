import { ClientConfig } from 'pg';
import Create from './builders/lowLvlBuilders/create';
import { DB, DbConnector } from './db';
import Migrator from './migrator/migrator';
import AbstractTable from './tables/abstractTable';

export * from './db';
export * from './builders';
export * from './columns';
export * from './tables';

export const drizzle = {
  prepareCreateTable<TTable extends AbstractTable<TTable>>(table: AbstractTable<TTable>): string {
    return Create.table(table).build();
  },
  migrator(db:DB): Migrator {
    return new Migrator(db);
  },
  async connect(config: ClientConfig): Promise<DB> {
    const dbConnector: DbConnector = new DbConnector().params(config);
    return dbConnector.connect();
  },
};
