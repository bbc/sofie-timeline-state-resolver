import { TSRInput } from '../src'
import { DeviceType } from 'timeline-state-resolver'

export const input: TSRInput = {
	devices: {
		gsaas0: {
			type: DeviceType.BBC_GSAAS,
			options: {
				brokerUrl: 'https://gsaas.graphics.int.tools.bbc.co.uk',
				apiKey: 'bzQS07BexGygtrrh1J9PhYwFLaBIQtb7',
			},
		},
	},
}
