import AbstractTable, { PgTable } from '../../tables/abstractTable';

export default class UserGroupsTable extends PgTable<UserGroupsTable> {
  public id = this.serial('id').primaryKey();

  public name = this.varchar('name');
  public description = this.varchar('description');

  public uniqueExample = this.uniqueIndex([this.name, this.description]);

  public tableName(): string {
    return 'user_groups';
  }
}
