import Docker from 'dockerode';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';
import 'zx/globals';

export async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 5656 });
	const image = 'geldata/gel:6';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const gelContainer = await docker.createContainer({
		Image: image,
		Env: [
			'GEL_CLIENT_SECURITY=insecure_dev_mode',
			'GEL_SERVER_SECURITY=insecure_dev_mode',
			'GEL_CLIENT_TLS_SECURITY=no_host_verification',
			'GEL_SERVER_PASSWORD=password',
		],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5656/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await gelContainer.start();

	return { connectionString: `gel://admin:password@localhost:${port}/main`, container: gelContainer };
}
