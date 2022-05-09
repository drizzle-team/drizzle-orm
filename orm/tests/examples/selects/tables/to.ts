import AbstractTable from '../../../../src/tables/abstractTable';

export default class UsersTable extends AbstractTable<UsersTable> {
  public id = this.serial('id').primaryKey();
  public fullName = this.text('full_name');

  public phone = this.varchar('phone', { size: 256 });
  public media = this.jsonb<string[]>('media');
  public decimalField = this.decimal('test', { precision: 100, scale: 2 }).notNull();
  public bigIntField = this.bigint('test1', 'max_bytes_53');

  public createdAt = this.timestamp('created_at').notNull();
  public isArchived = this.bool('is_archived').defaultValue(false);

  // public phoneFullNameIndex = this.index([this.phone, this.fullName]);
  // public phoneIndex = this.uniqueIndex(this.phone);

  public tableName(): string {
    return 'test_users';
  }
}
