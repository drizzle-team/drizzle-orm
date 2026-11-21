import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';

/** Postgres dialect of AWS Data API, which takes named `:pN` parameters */
export class PostgresAuroraDialect extends PgDialect {
	static override readonly [entityKind]: string = 'PostgresAuroraDialect';

	override escapeParam(num: number): string {
		return `:p${num + 1}`;
	}
}
