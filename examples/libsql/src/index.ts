import { serve } from '@hono/node-server';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { app, db } from './server';

async function main() {
	await migrate(db, {
		migrationsFolder: './migrations',
	});

	serve(app).listen(3000).once('listening', () => {
		console.log('🚀 Server started on port 3000');
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
