import AbstractTable, { PgTable } from '../../tables/abstractTable';
import UsersTable from './usersTable';

interface CityMeta {
  population: number,
  connection: string,
}

export default class CitiesTable extends PgTable<CitiesTable> {
  public id = this.serial('id').primaryKey();

  public foundationDate = this.timestamp('name').notNull();
  public location = this.varchar('page', { size: 256 });

  public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, { onUpdate: 'CASCADE' });

  public metadata = this.jsonb<CityMeta>('metadata');

  public tableName(): string {
    return 'cities';
  }
}
