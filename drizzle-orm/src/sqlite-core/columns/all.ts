import { blob } from './blob.ts';
import { customType } from './custom.ts';
import { integer } from './integer.ts';
import { numeric } from './numeric.ts';
import { real } from './real.ts';
import { text } from './text.ts';

export function getSQLiteColumnBuilders() {
	return {
		blob,
		customType,
		integer,
		numeric,
		real,
		text,
	};
}

export type SQLiteColumnBuilders = ReturnType<typeof getSQLiteColumnBuilders>;
