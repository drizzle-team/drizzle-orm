import AbstractTable from '../../tables/abstractTable';
import UsersTable from './usersTable';

interface CityMeta {
  population: number,
  connection: string,
}

export default class CitiesTable extends AbstractTable<CitiesTable> {
  public id = this.int('id').autoIncrement().primaryKey();

  public foundationDate = this.timestamp('name', { notNull: true });
  public location = this.varchar('page', { size: 256 });

  public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, { onUpdate: 'CASCADE' });

  public metadata = this.jsonb<CityMeta>('metadata');

  public tableName(): string {
    return 'cities';
  }
}
