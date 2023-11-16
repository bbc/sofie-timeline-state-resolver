import { literal } from '../../../devices/device'
import { AtemDevice } from '..'
import * as AtemConnection from 'atem-connection'
import { promisify } from 'util'
import { AtemOptions } from 'timeline-state-resolver-types'
import { getDeviceContext } from '../../__tests__/testlib'

const sleep = promisify(setTimeout)

export async function waitForConnection(device: AtemDevice) {
	for (let i = 0; i < 10; i++) {
		await sleep(10)
		if (device.connected) break
	}
	if (!device.connected) throw new Error('Mock device failed to report connected')
}

export async function createDevice(doWaitForConnection = true): Promise<AtemDevice> {
	const device = new AtemDevice(getDeviceContext())
	await device.init(
		literal<AtemOptions>({
			host: '127.0.0.1',
		})
	)

	if (doWaitForConnection) {
		await waitForConnection(device)
	}

	return device
}

export function compareAtemCommands(
	received: AtemConnection.Commands.ISerializableCommand,
	expected: AtemConnection.Commands.ISerializableCommand
) {
	expect(received.constructor.name).toEqual(expected.constructor.name)
	expect(received.serialize(AtemConnection.Enums.ProtocolVersion.V8_0)).toEqual(
		expected.serialize(AtemConnection.Enums.ProtocolVersion.V8_0)
	)
}
