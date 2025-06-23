import { parseEnum } from 'src/dialects/mysql/grammar';
import { expect, test } from 'vitest';

test('enum', () => {
	expect(parseEnum("enum('one','two','three')")).toStrictEqual(['one', 'two', 'three']);
});
