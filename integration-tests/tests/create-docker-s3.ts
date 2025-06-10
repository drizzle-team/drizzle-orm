import {
	type _Object,
	CreateBucketCommand,
	DeleteObjectsCommand,
	ListObjectsV2Command,
	S3Client,
} from '@aws-sdk/client-s3';
import Docker from 'dockerode';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';

export const defaultBucket = 'default-file-bucket';

export async function createDockerS3() {
	let baseUrl: string | undefined = process.env['S3_CONNECTION_ENDPOINT'] ?? 'http://localhost:9000';
	let container: Docker.Container | undefined;

	const { status } = await fetch(`${baseUrl}/minio/health/ready`).catch(() => ({ status: 500 }));
	if (status < 200 || status >= 300) {
		const docker = new Docker();
		const port = await getPort({ port: 9000 });
		const image = 'minio/minio:RELEASE.2025-05-24T17-08-30Z';

		const pullStream = await docker.pull(image);
		await new Promise((resolve, reject) =>
			docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
		);

		container = await docker.createContainer({
			Image: image,
			Env: [
				'MINIO_ROOT_USER=minioadmin',
				'MINIO_ROOT_PASSWORD=minioadmin',
			],
			name: `drizzle-integration-tests-s3-${uuidV4()}`,
			HostConfig: {
				AutoRemove: true,
				PortBindings: {
					'9000/tcp': [{ HostPort: `${port}` }],
				},
			},
			ExposedPorts: {
				'9000/tcp': {},
			},
			Cmd: ['server', '/data', '--console-address', ':9001'],
		});

		await container.start();

		baseUrl = `http://localhost:${port}`;
		const sleep = 1000;
		let timeLeft = 30000;
		let connected = false;
		let lastError: unknown | undefined;
		do {
			try {
				const res = await fetch(`${baseUrl}/minio/health/ready`);
				if (res.status > 200 || res.status >= 300) throw new Error(`Health check failed with status ${res.status}`);
				connected = true;
				break;
			} catch (e) {
				lastError = e;
				await new Promise((resolve) => setTimeout(resolve, sleep));
				timeLeft -= sleep;
			}
		} while (timeLeft > 0);

		if (!connected) {
			console.error('Cannot connect to MinIO');
			await container.stop().catch(console.error);
			throw lastError;
		}
	}

	const bucket = `bucket-${uuidV4()}-test`;
	const s3 = new S3Client({
		endpoint: baseUrl,
		region: 'us-east-1',
		credentials: {
			accessKeyId: 'minioadmin',
			secretAccessKey: 'minioadmin',
		},
		forcePathStyle: true,
		// Supress MD5 warnings - appear only in workflow tests
		// TBD: figure out why MD5 warnings appear in tests
		logger: {
			trace: () => null,
			debug: () => null,
			error: () => null,
			info: () => null,
			warn: () => null,
		},
	});

	await s3.send(
		new CreateBucketCommand({
			Bucket: bucket,
		}),
	);

	await s3.send(
		new CreateBucketCommand({
			Bucket: defaultBucket,
		}),
	).catch(() => null);

	const s3Wipe = async () => {
		try {
			let objects: _Object[] | undefined;
			do {
				const listResponse = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
				objects = listResponse.Contents;

				if (!objects?.length) {
					break;
				}

				const deleteParams = {
					Bucket: bucket,
					Delete: {
						Objects: objects.map((obj: _Object) => ({ Key: obj.Key! })),
					},
				};

				await s3.send(new DeleteObjectsCommand(deleteParams));
			} while (objects?.length);
		} catch (e) {
			console.log(e);
		}
	};

	const s3Stop = async () => {
		s3.destroy();
		await container?.stop().catch((e) => console.log(e));
	};

	return {
		s3,
		s3Wipe,
		s3Stop,
		bucket,
	};
}
