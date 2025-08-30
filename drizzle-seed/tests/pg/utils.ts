import Docker from 'dockerode';
import getPort from 'get-port';

export const createDockerPostgis = async () => {
	const docker = new Docker();
	const port = await getPort();
	const image = 'postgis/postgis:16-3.4';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err: any) => err ? reject(err) : resolve(err))
	);

	const user = 'postgres', password = 'postgres', database = 'postgres';
	const pgContainer = await docker.createContainer({
		Image: image,
		Env: [`POSTGRES_USER=${user}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DATABASE=${database}`],
		name: `drizzle-seed-tests-${crypto.randomUUID()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return {
		url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
		container: pgContainer,
	};
};
