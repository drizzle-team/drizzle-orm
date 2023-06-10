import { PgDialect, PgJson, PgNumeric, PgTime, PgTimestamp, PgDate, PgUUID } from "~/pg-core";
import { PgJsonb } from "./columns/jsonb";
import { type DriverValueEncoder, type QueryTypingsValue } from "~/sql";

export class PgJSDialect extends PgDialect {
	override prepareTyping(encoder: DriverValueEncoder<unknown, unknown>): QueryTypingsValue {
		if (
			encoder instanceof PgJsonb || encoder instanceof PgJson
		) {
			return 'json';
		} else if (encoder instanceof PgNumeric) {
			return 'decimal';
		} else if (encoder instanceof PgTime) {
			return 'time';
		} else if (encoder instanceof PgTimestamp) {
			return 'timestamp';
		} else if (encoder instanceof PgDate) {
			return 'date';
		} else if (encoder instanceof PgUUID) {
			return 'uuid';
		} else {
			return 'none';
		}
	}
}