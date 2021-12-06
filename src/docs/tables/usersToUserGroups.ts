import AbstractTable from '../../tables/abstractTable';
import UserGroupsTable from './userGroupsTable';
import UsersTable from './usersTable';

export default class UsersToUserGroupsTable extends AbstractTable<UsersToUserGroupsTable> {
  public groupId = this.int('city_id').foreignKey(UserGroupsTable, (table) => table.id, { onDelete: 'CASCADE' });
  public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, { onDelete: 'CASCADE' });

  public manyToManyIndex = this.index([this.groupId, this.userId]);

  public tableName(): string {
    return 'users_to_user_groups';
  }
}
