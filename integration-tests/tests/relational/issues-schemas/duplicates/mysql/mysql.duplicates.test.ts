import 'dotenv/config';
import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import getPort from 'get-port';
import * as mysql from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schema from './mysql.duplicates';

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

let mysqlContainer: Docker.Container;
let db: MySql2Database<typeof schema>;
let client: mysql.Connection;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

beforeAll(async () => {
	const connectionString = process.env['MYSQL_CONNECTION_STRING'] ?? await createDockerDB();

	const sleep = 1000;
	let timeLeft = 30000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await mysql.createConnection(connectionString);
			await client.connect();
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MySQL');
		await client?.end().catch(console.error);
		await mysqlContainer?.stop().catch(console.error);
		throw lastError;
	}
	db = drizzle({ client, schema, logger: ENABLE_LOGGING, mode: 'default' });
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await mysqlContainer?.stop().catch(console.error);
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists \`members\``);
	await db.execute(sql`drop table if exists \`artist_to_member\``);
	await db.execute(sql`drop table if exists \`artists\``);
	await db.execute(sql`drop table if exists \`albums\``);

	await db.execute(
		sql`
			CREATE TABLE \`members\` (
			    \`id\` serial AUTO_INCREMENT PRIMARY KEY NOT NULL,
			    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    \`name_en\` varchar(50) NOT NULL,
			    \`name_kr\` varchar(50) NOT NULL,
			    \`stage_name_en\` varchar(50) NOT NULL,
			    \`stage_name_kr\` varchar(50) NOT NULL,
			    \`image\` varchar(255) NOT NULL,
			    \`instagram\` varchar(255) NOT NULL);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`artist_to_member\` (
			    \`id\` serial AUTO_INCREMENT PRIMARY KEY NOT NULL,
			    \`member_id\` int NOT NULL,
			    \`artist_id\` int NOT NULL);
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`artists\` (
			    \`id\` serial AUTO_INCREMENT PRIMARY KEY NOT NULL,
			    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    \`name_en\` varchar(50) NOT NULL,
			    \`name_kr\` varchar(50) NOT NULL,
			    \`debut\` date NOT NULL,
			    \`company_id\` int NOT NULL,
			    \`is_group\` boolean NOT NULL DEFAULT true,
			    \`image\` varchar(255) NOT NULL,
			    \`twitter\` varchar(255) NOT NULL,
			    \`instagram\` varchar(255) NOT NULL,
			    \`youtube\` varchar(255) NOT NULL,
			    \`website\` varchar(255) NOT NULL,
			    \`spotify_id\` varchar(32));
		`,
	);
	await db.execute(
		sql`
			CREATE TABLE \`albums\` (
			    \`id\` serial AUTO_INCREMENT PRIMARY KEY NOT NULL,
			    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
			    \`artist_id\` int NOT NULL,
			    \`name\` varchar(50) NOT NULL,
			    \`region\` enum('en','kr','jp','other') NOT NULL,
			    \`release_date\` date NOT NULL,
			    \`image\` varchar(255) NOT NULL,
			    \`spotify_id\` varchar(32));
		`,
	);
});

test('Simple case from GH', async () => {
	await db.insert(schema.artists).values([
		{
			id: 1,
			nameEn: 'Dan',
			nameKr: '',
			debut: new Date(),
			companyId: 1,
			image: '',
			twitter: '',
			instagram: '',
			youtube: '',
			website: '',
		},
		{
			id: 2,
			nameEn: 'Andrew',
			nameKr: '',
			debut: new Date(),
			companyId: 1,
			image: '',
			twitter: '',
			instagram: '',
			youtube: '',
			website: '',
		},
		{
			id: 3,
			nameEn: 'Alex',
			nameKr: '',
			debut: new Date(),
			companyId: 1,
			image: '',
			twitter: '',
			instagram: '',
			youtube: '',
			website: '',
		},
	]);

	await db.insert(schema.albums).values([
		{ id: 1, artistId: 1, name: 'Album1', region: 'en', releaseDate: new Date(), image: '' },
		{ id: 2, artistId: 2, name: 'Album2', region: 'en', releaseDate: new Date(), image: '' },
		{ id: 3, artistId: 3, name: 'Album3', region: 'en', releaseDate: new Date(), image: '' },
	]);

	await db.insert(schema.members).values([
		{ id: 1, nameEn: 'MemberA', nameKr: '', stageNameEn: '', stageNameKr: '', image: '', instagram: '' },
		{ id: 2, nameEn: 'MemberB', nameKr: '', stageNameEn: '', stageNameKr: '', image: '', instagram: '' },
		{ id: 3, nameEn: 'MemberC', nameKr: '', stageNameEn: '', stageNameKr: '', image: '', instagram: '' },
	]);

	await db.insert(schema.artistsToMembers).values([
		{ memberId: 1, artistId: 1 },
		{ memberId: 2, artistId: 1 },
		{ memberId: 2, artistId: 2 },
		{ memberId: 3, artistId: 3 },
	]);

	const response = await db._query.artists.findFirst({
		where: (artists, { eq }) => eq(artists.id, 1),
		with: {
			albums: true,
			members: {
				columns: {},
				with: {
					member: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			createdAt: Date;
			updatedAt: Date;
			nameEn: string;
			nameKr: string;
			debut: Date;
			companyId: number;
			isGroup: boolean;
			image: string;
			twitter: string;
			instagram: string;
			youtube: string;
			website: string;
			spotifyId: string | null;
			members: {
				member: {
					id: number;
					createdAt: Date;
					updatedAt: Date;
					nameEn: string;
					nameKr: string;
					image: string;
					instagram: string;
					stageNameEn: string;
					stageNameKr: string;
				};
			}[];
			albums: {
				id: number;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				image: string;
				spotifyId: string | null;
				artistId: number;
				region: 'en' | 'kr' | 'jp' | 'other';
				releaseDate: Date;
			}[];
		} | undefined
	>();

	expect(response?.members.length).eq(2);
	expect(response?.albums.length).eq(1);

	expect(response?.albums[0]).toEqual({
		id: 1,
		createdAt: response?.albums[0]?.createdAt,
		updatedAt: response?.albums[0]?.updatedAt,
		artistId: 1,
		name: 'Album1',
		region: 'en',
		releaseDate: response?.albums[0]?.releaseDate,
		image: '',
		spotifyId: null,
	});
});
