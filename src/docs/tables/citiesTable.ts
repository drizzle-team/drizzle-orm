import AbstractTable from '../../tables/abstractTable';

interface CityMeta {
  population: number,
  connection: string,
}

export default class CitiesTable extends AbstractTable<CitiesTable> {
  public id = this.serial('id').primaryKey();

  public foundationDate = this.timestamp('name').notNull();
  public location = this.varchar('page', { size: 256 });

  public userId = this.int('user_id').foreignKey(CitiesTable, (table) => table.id, { onUpdate: 'CASCADE' });

  public metadata = this.jsonb<CityMeta>('metadata');

  public tableName(): string {
    return 'cities';
  }
}
