import { array } from './array.ts';
import { bool } from './bool.ts';
import { customType } from './custom.ts';
import { datetime } from './datetime.ts';
import { float } from './float.ts';
import { int } from './int.ts';
import { object } from './object.ts';
import { string } from './string.ts';

export function getSurrealDBColumnBuilders() {
	return {
		array,
		bool,
		customType,
		datetime,
		float,
		int,
		object,
		string,
	};
}

export type SurrealDBColumnBuilders = ReturnType<typeof getSurrealDBColumnBuilders>;
