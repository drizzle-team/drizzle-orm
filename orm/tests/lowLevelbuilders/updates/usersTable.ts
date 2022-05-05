import AbstractTable from '../../../src/tables/abstractTable';
import { createEnum } from '../../../src/types/type';
import { Defaults } from '../../../src/columns/column';

export const rolesEnum = createEnum({ alias: 'test-enum', values: ['foo', 'bar', 'baz'] });

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.serial('id').primaryKey();
  public fullName = this.text('full_name');

  public phone = this.varchar('phone', { size: 256 });
  public media = this.jsonb<string[]>('media');
  public decimalField = this.decimal('test', { precision: 100, scale: 2 }).notNull();
  public bigIntField = this.bigint('test1', 'max_bytes_53');
  public role = this.type(rolesEnum, 'name_in_table').notNull();

  public createdAt = this.timestamp('created_at').notNull();
  public createdAtWithTimezone = this.timestamptz('created_at_with_timezone');

  public updatedAt = this.timestamp('updated_at').defaultValue(Defaults.CURRENT_TIMESTAMP);
  public isArchived = this.bool('is_archived').defaultValue(false);

  public phoneFullNameIndex = this.index([this.phone, this.fullName]);
  public phoneIndex = this.uniqueIndex(this.phone);

  public tableName(): string {
    return 'users';
  }
}
