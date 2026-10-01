import { SQL, sql } from "drizzle-orm";

export interface ColumnConfig {
  name?: string;
  customType?: any;
  // Adicionando a propriedade wrap para permitir SQL customizado ao selecionar a coluna
  wrap?: (column: SQL) => SQL;
}

export class Column {
  constructor(
    public readonly name: string,
    public readonly config: ColumnConfig
  ) {}

  // Método para obter a representação SQL da coluna, aplicando o wrap se existir
  toSQL(): SQL {
    const columnSql = sql.identifier(this.name);
    if (this.config.wrap) {
      return this.config.wrap(columnSql);
    }
    return columnSql;
  }
}
