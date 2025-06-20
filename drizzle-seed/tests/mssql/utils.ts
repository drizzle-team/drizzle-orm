import Docker from 'dockerode';
import getPort from 'get-port';
import type { config } from 'mssql';
import { v4 as uuid } from 'uuid';

export async function createDockerDB(): Promise<
	{ container: Docker.Container; options: config }
> {
	const docker = new Docker();
	const port = await getPort({ port: 1433 });
	const image = 'mcr.microsoft.com/azure-sql-edge';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const mssqlContainer = await docker.createContainer({
		Image: image,
		Env: ['ACCEPT_EULA=1', 'MSSQL_SA_PASSWORD=drizzle123PASSWORD!'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'1433/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mssqlContainer.start();

	const options: config = {
		server: 'localhost',
		user: 'SA',
		password: 'drizzle123PASSWORD!',
		pool: {
			max: 1,
		},
		options: {
			requestTimeout: 100_000,
			encrypt: true, // for azure
			trustServerCertificate: true,
		},
	};
	return {
		options,
		container: mssqlContainer,
	};
}
