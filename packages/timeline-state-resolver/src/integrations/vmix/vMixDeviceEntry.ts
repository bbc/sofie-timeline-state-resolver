import { DeviceEntry } from '../../service/devices'
import { VMixDevice } from '.'

export class vMixDeviceEntry implements DeviceEntry {
	public readonly deviceClass = VMixDevice
	public readonly canConnect = true
	public deviceName = (deviceId: string) => 'vMix ' + deviceId
	public executionMode = () => 'salvo' as const
}
