import { describe, expect, test } from 'vitest';
import { pgTable, serial, text } from '~/pg-core/index.ts';
import { mapResultRow, orderSelectedFields } from '~/utils.ts';

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name'),
});

const profiles = pgTable('profiles', {
	id: serial('id').primaryKey(),
	bio: text('bio'),
	website: text('website'),
});

describe('mapResultRow with left joins', () => {
	test('preserves nested object when first column is null but subsequent column is not null (issue #1603)', () => {
		const fields = orderSelectedFields({
			user: {
				id: users.id,
				name: users.name,
			},
			profile: {
				bio: profiles.bio,
				website: profiles.website,
			},
		});

		const joinsNotNullableMap = {
			profiles: false,
		};

		// Left join matched: bio is null, but website is present
		const row = [1, 'Alice', null, 'https://example.com'];
		const result = mapResultRow<{
			user: { id: number; name: string };
			profile: { bio: string | null; website: string | null } | null;
		}>(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			user: { id: 1, name: 'Alice' },
			profile: { bio: null, website: 'https://example.com' },
		});
	});

	test('nullifies nested object when all columns of left-joined table are null', () => {
		const fields = orderSelectedFields({
			user: {
				id: users.id,
				name: users.name,
			},
			profile: {
				bio: profiles.bio,
				website: profiles.website,
			},
		});

		const joinsNotNullableMap = {
			profiles: false,
		};

		// Left join did not match: both bio and website are null
		const row = [2, 'Bob', null, null];
		const result = mapResultRow<{
			user: { id: number; name: string };
			profile: { bio: string | null; website: string | null } | null;
		}>(fields, row, joinsNotNullableMap);

		expect(result).toEqual({
			user: { id: 2, name: 'Bob' },
			profile: null,
		});
	});
});
