import { DeviceType, Mapping, MappingBbcGsaasType, SomeMappingBbcGsaas} from 'timeline-state-resolver'
import { literal } from 'timeline-state-resolver/dist/devices/device'
import type { TSRInput } from '../src'

export const input: TSRInput = {
	mappings: {
		gsaasLoad0: literal<Mapping<SomeMappingBbcGsaas>>({
			device: DeviceType.BBC_GSAAS,
			deviceId: 'gsaas0',
			options: {
				mappingType: MappingBbcGsaasType.Channel,
				group: 'sofieTest',
				channel: 'L3',
			},
		}),
		gsaasZone0: literal<Mapping<SomeMappingBbcGsaas>>({
			device: DeviceType.BBC_GSAAS,
			deviceId: 'gsaas0',
			options: {
				mappingType: MappingBbcGsaasType.Zone,
				group: 'sofieTest',
				channel: 'L3',
				zone: 'mainStrap'
			},
		}),
		gsaasZone1: literal<Mapping<SomeMappingBbcGsaas>>({
			device: DeviceType.BBC_GSAAS,
			deviceId: 'gsaas0',
			options: {
				mappingType: MappingBbcGsaasType.Zone,
				group: 'sofieTest',
				channel: 'L3',
				zone: 'locatorLeft'
			},
		}),
	},
}
