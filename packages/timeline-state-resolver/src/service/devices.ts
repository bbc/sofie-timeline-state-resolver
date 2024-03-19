import { OscDevice } from '../integrations/osc'
import { DeviceType } from 'timeline-state-resolver-types'
import { Device, DeviceContextAPI } from './device'
import { HTTPSendDevice } from '../integrations/httpSend'
import { ShotokuDevice } from '../integrations/shotoku'
import { HTTPWatcherDevice } from '../integrations/httpWatcher'
import { AbstractDevice } from '../integrations/abstract'
import { AtemDevice } from '../integrations/atem'
import { TcpSendDevice } from '../integrations/tcpSend'
import { QuantelDevice } from '../integrations/quantel'
import { HyperdeckDevice } from '../integrations/hyperdeck'
import { OBSDevice } from '../integrations/obs'
import { PanasonicPtzDevice } from '../integrations/panasonicPTZ'
import { LawoDevice } from '../integrations/lawo'
import { BBCGSAASDevice } from '../integrations/bbcGsaas'

export interface DeviceEntry {
	deviceClass: new (context: DeviceContextAPI<any>) => Device<any, any, any>
	canConnect: boolean
	deviceName: (deviceId: string, options: any) => string
	executionMode: (options: any) => 'salvo' | 'sequential'
}

export type ImplementedServiceDeviceTypes =
	| DeviceType.ABSTRACT
	| DeviceType.ATEM
	| DeviceType.BBC_GSAAS
	| DeviceType.HTTPSEND
	| DeviceType.HTTPWATCHER
	| DeviceType.HYPERDECK
	| DeviceType.LAWO
	| DeviceType.OBS
	| DeviceType.OSC
	| DeviceType.PANASONIC_PTZ
	| DeviceType.SHOTOKU
	| DeviceType.TCPSEND
	| DeviceType.QUANTEL

// TODO - move all device implementations here and remove the old Device classes
export const DevicesDict: Record<ImplementedServiceDeviceTypes, DeviceEntry> = {
	[DeviceType.ABSTRACT]: {
		deviceClass: AbstractDevice,
		canConnect: false,
		deviceName: (deviceId: string) => 'Abstract ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.ATEM]: {
		deviceClass: AtemDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'Atem ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.BBC_GSAAS]: {
		deviceClass: BBCGSAASDevice,
		canConnect: false,
		deviceName: (deviceId: string) => 'BBC-GSSAS ' + deviceId,
		executionMode: () => 'sequential',
	},
	[DeviceType.HTTPSEND]: {
		deviceClass: HTTPSendDevice,
		canConnect: false,
		deviceName: (deviceId: string) => 'HTTPSend ' + deviceId,
		executionMode: () => 'sequential', // todo - config?
	},
	[DeviceType.HTTPWATCHER]: {
		deviceClass: HTTPWatcherDevice,
		canConnect: false,
		deviceName: (deviceId: string) => 'HTTP-Watch ' + deviceId,
		executionMode: () => 'sequential',
	},
	[DeviceType.HYPERDECK]: {
		deviceClass: HyperdeckDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'Hyperdeck ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.LAWO]: {
		deviceClass: LawoDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'Lawo ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.OBS]: {
		deviceClass: OBSDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'OBS ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.OSC]: {
		deviceClass: OscDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'OSC ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.PANASONIC_PTZ]: {
		deviceClass: PanasonicPtzDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'Panasonic PTZ ' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.SHOTOKU]: {
		deviceClass: ShotokuDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'SHOTOKU' + deviceId,
		executionMode: () => 'salvo',
	},
	[DeviceType.TCPSEND]: {
		deviceClass: TcpSendDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'TCP' + deviceId,
		executionMode: () => 'sequential', // todo: should this be configurable?
	},
	[DeviceType.QUANTEL]: {
		deviceClass: QuantelDevice,
		canConnect: true,
		deviceName: (deviceId: string) => 'Quantel' + deviceId,
		executionMode: () => 'salvo',
	},
}
