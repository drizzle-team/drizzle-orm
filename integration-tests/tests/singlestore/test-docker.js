import Docker from 'dockerode';
import getPort from 'get-port';
import * as mysql2 from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const initSqlPath = path.resolve(__dirname, 'test/init.sql');

let singlestoreContainer;
const docker = new Docker();

console.log('Getting an available port for SingleStore...');
const port = await getPort({ port: 3306 });
console.log(`Port ${port} selected.`);

const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

console.log('Pulling the SingleStoreDB Dev image...');
const pullStream = await docker.pull(image);
await new Promise((resolve, reject) =>
	docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
);
console.log('Image pulled successfully.');

console.log('Creating the SingleStoreDB container...');
singlestoreContainer = await docker.createContainer({
	Image: image,
	Env: ['ROOT_PASSWORD=singlestore'],
	name: `drizzle-integration-tests-${uuid()}`,
	HostConfig: {
		AutoRemove: true,
		PortBindings: {
			'3306/tcp': [{ HostPort: `${port}` }],
			'8080/tcp': [{ HostPort: '8080' }],
		},
		Binds: [`${initSqlPath}:/init.sql`],
	},
});
console.log('Container created successfully.');

console.log('Starting the SingleStoreDB container...');
await singlestoreContainer.start();
await new Promise((resolve) => setTimeout(resolve, 4000));
console.log('Container started.');

console.log('Connecting to the database...');
const connection = await mysql2.createConnection({
	host: 'localhost',
	port: port,
	user: 'root',
	password: 'singlestore',
});
console.log('Database connection established.');

console.log('Creating "drizzle" database...');
await connection.query('CREATE DATABASE drizzle;');
console.log('Database "drizzle" created.');

console.log('Switching to "drizzle" database...');
await connection.query('USE drizzle;');
console.log('Switched to "drizzle" database.');

console.log('Creating test table...');
await connection.query(`
    CREATE TABLE test_table (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL
    );
`);
console.log('Test table created.');

console.log('Inserting test row...');
await connection.query('INSERT INTO test_table (name) VALUES (?);', ['test_name']);
console.log('Test row inserted.');

console.log('Querying test table...');
const [rows] = await connection.query('SELECT * FROM test_table;');
console.log('Query Result:', rows);

console.log('Closing database connection...');
await connection.end();
console.log('Database connection closed.');

console.log('Stopping and removing the container...');
await singlestoreContainer.stop();
await singlestoreContainer.remove();
console.log('Container stopped and removed.');
