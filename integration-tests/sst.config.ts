// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
	app(_input) {
		return {
			name: 'awsdataapi',
			removal: 'remove',
			home: 'aws',
			providers: { aws: '6.70.1' },
		};
	},
	async run() {
		const vpc = new sst.aws.Vpc('MyVpc');

		new sst.aws.Aurora('Postgres', {
			dataApi: true,
			engine: 'postgres',
			vpc,
		});
	},
});
