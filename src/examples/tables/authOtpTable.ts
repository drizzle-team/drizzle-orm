import { OnDelete } from '../../columns/column';
import AbstractTable from '../../tables/abstractTable';
import UsersTable from './usersTable';

export default class AuthOtpTable extends AbstractTable<AuthOtpTable> {
  public id = this.int('id').autoIncrement().primaryKey();
  public phone = this.varchar('phone', { size: 256 });
  public otp = this.varchar('otp', { size: 256 });
  public issuedAt = this.timestamp('issued_at', { notNull: true });
  public createdAt = this.timestamp('created_at', { notNull: true });
  public updatedAt = this.timestamp('updated_at', { notNull: true });

  public userId = this.int('user_id').foreignKey(UsersTable, (table) => table.id, OnDelete.CASCADE);

  public test = this.jsonb<string[]>('test');

  public tableName(): string {
    return 'auth_otp';
  }
}
