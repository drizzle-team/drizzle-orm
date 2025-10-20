import Docker, { type Container } from 'dockerode';
import getPort from 'get-port';
import { v4 as uuid } from 'uuid';

export async function createDockerDB(): Promise<{ url: string; container: Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	const singleStoreContainer = await docker.createContainer({
		Image: image,
		Env: ['ROOT_PASSWORD=singlestore'],
		name: `drizzle-seed-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await singleStoreContainer.start();
	await new Promise((resolve) => setTimeout(resolve, 4000));

	return { url: `singlestore://root:singlestore@localhost:${port}/`, container: singleStoreContainer };
}
