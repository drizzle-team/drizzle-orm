// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(_input) {
		return {
			name: 'awsdataapi',
			removal: 'remove',
			home: 'aws',
		};
	},
	async run() {
		new sst.aws.Postgres('Postgres', {
			scaling: {
				min: '0.5 ACU',
				max: '1 ACU',
			},
		});
	},
});
