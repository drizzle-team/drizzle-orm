import AbstractTable from './abstractTable';

export default class MigrationsTable extends AbstractTable<MigrationsTable> {
  public id = this.serial('id').primaryKey();
  public hash = this.text('hash').notNull();
  public createdAt = this.bigint('created_at');

  public tableName(): string {
    return 'drizzle_migrations';
  }
}
