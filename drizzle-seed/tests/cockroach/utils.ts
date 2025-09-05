import Docker from 'dockerode';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';

export async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 26257 });
	const image = 'cockroachdb/cockroach:v25.2.0';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const cockroachdbContainer = await docker.createContainer({
		Image: image,
		Cmd: ['start-single-node', '--insecure'],
		name: `drizzle-seed-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'26257/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await cockroachdbContainer.start();

	return {
		connectionString: `postgresql://root@127.0.0.1:${port}/defaultdb?sslmode=disable`,
		container: cockroachdbContainer,
	};
}
