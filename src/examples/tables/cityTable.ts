import AbstractTable from '../../tables/abstractTable';
import UsersTable from './usersTable';

export default class CitiesTable extends AbstractTable<CitiesTable> {
  public name = this.timestamp('name', { notNull: true }).defaultValue(new Date());
  public page = this.varchar('page', { size: 256 });

  public userId1 = this.int('user_id').foreignKey(UsersTable, (table) => table.id);

  public data = this.jsonb<string[]>('data');

  public tableName(): string {
    return 'citiess';
  }
}
