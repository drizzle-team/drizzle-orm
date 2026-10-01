import { Column, ColumnConfig } from "../column";
import { SQL, sql } from "drizzle-orm";

export abstract class BaseColumn<T> extends Column {
  constructor(name: string, config: ColumnConfig) {
    super(name, config);
  }

  // Sobrescrevemos a lógica de seleção para garantir que o wrap seja respeitado
  // em todas as operações de SELECT do ORM
  select(): SQL {
    return this.toSQL();
  }
}
