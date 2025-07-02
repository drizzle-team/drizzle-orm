import Docker from 'dockerode';
import getPort from 'get-port';
import type { config } from 'mssql';
import { v4 as uuid } from 'uuid';

export async function createDockerDB(suffix?: string): Promise<
	{ container: Docker.Container; options: config }
> {
	const docker = new Docker();
	const port1433 = await getPort();
	// const port1431 = await getPort();
	const image = 'mcr.microsoft.com/azure-sql-edge';

	const pullStream = await docker.pull(image); // { platform: 'linux/amd64' });
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const password = 'drizzle123PASSWORD!';
	const createOptions: Docker.ContainerCreateOptions = {
		Image: image,
		// platform: 'linux/amd64',
		Env: ['ACCEPT_EULA=1', `MSSQL_SA_PASSWORD=${password}`], // , 'MSSQL_TCP_PORT=1433'],
		name: `drizzle-seed-tests-${suffix}-${uuid()}`,
		// ExposedPorts: { '1433/tcp': {}, '1431/tcp': {} },
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'1433/tcp': [{ HostPort: `${port1433}` }],
			},
			// CapAdd: ['SYS_PTRACE'],
		},
	};

	// createOptions.Platform = 'linux/amd64';

	const mssqlContainer = await docker.createContainer(createOptions);

	await mssqlContainer.start();

	const options: config = {
		server: 'localhost',
		port: port1433,
		user: 'SA',
		password,
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
