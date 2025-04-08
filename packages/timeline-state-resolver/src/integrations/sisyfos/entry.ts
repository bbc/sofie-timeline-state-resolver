import { DeviceEntry } from '../../service/devices'
import { SisyfosMessageDevice } from '.'

export class SisyfosDeviceEntry implements DeviceEntry {
	public readonly deviceClass = SisyfosMessageDevice
	public readonly canConnect = true
	public deviceName = (deviceId: string) => 'Sisyfos ' + deviceId
	public executionMode = () => 'salvo' as const
}
