import AbstractTable from '../../tables/abstractTable';

export default class UserGroupsTable extends AbstractTable<UserGroupsTable> {
  public id = this.int('id').autoIncrement().primaryKey();

  public name = this.varchar('name');
  public description = this.varchar('description');

  public tableName(): string {
    return 'user_groups';
  }
}
