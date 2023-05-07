import pg from 'pg';
import { drizzle } from '~/node-postgres';
import { placeholder } from '~/sql';
import * as schema from './schema';

const { Pool } = pg;

const pdb = new Pool({ connectionString: process.env['PG_CONNECTION_STRING'] });
const db = drizzle(pdb, { schema });

const result = await db.query.users.findMany({
	orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.id)],
	include: {
		posts: {
			select: {
				id: false,
				author: true,
				comments: {
					where: (comments, { sql }) => sql`char_length(${comments.text} > 1)`,
					limit: placeholder('l'),
					select: {
						text: true,
						author: {
							select: {
								city: {
									include: {
										users: true,
									},
								},
							},
						},
					},
				},
			},
		},
	},
});
