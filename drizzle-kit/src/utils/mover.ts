export type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Identity,
	Index,
	InterimSchema,
	Policy,
	PostgresDDL,
	PostgresEntity,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../dialects/postgres/ddl';
import type { PostgresEntities } from '../dialects/postgres/ddl';
export type Table = PostgresEntities['tables'];
export * from '../dialects/postgres/introspect';
