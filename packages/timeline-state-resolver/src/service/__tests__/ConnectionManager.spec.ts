import { DeviceOptionsAny, DeviceStatus, DeviceType, OSCDeviceType, StatusCode } from 'timeline-state-resolver-types'
import { ConstructedMockDevices, MockDeviceInstanceWrapper } from '../../__tests__/mockDeviceInstanceWrapper.js'
import { ConnectionManager } from '../ConnectionManager.js'
import { DevicesRegistry } from '../devicesRegistry.js'

// Mock explicitly the 'dist' version, as that is what threadedClass is being told to load
jest.mock('../../../dist/service/DeviceInstance', () => ({
	DeviceInstanceWrapper: MockDeviceInstanceWrapper,
}))
jest.mock('../DeviceInstance', () => ({
	DeviceInstanceWrapper: MockDeviceInstanceWrapper,
}))

const OSC_CONFIG = {
	osc0: {
		type: DeviceType.OSC,
		options: {
			host: '127.0.0.1',
			port: 5250,
			type: OSCDeviceType.UDP,
		},
	},
} as const

function oscConfig(id: string): Record<string, DeviceOptionsAny> {
	return {
		[id]: {
			type: DeviceType.OSC,
			options: {
				host: '127.0.0.1',
				port: 5250,
				type: OSCDeviceType.UDP,
			},
		},
	}
}

describe('ConnectionManager', () => {
	const connManager = new ConnectionManager(new DevicesRegistry())

	test('adding/removing a device', async () => {
		let resolveAdded: undefined | (() => void) = undefined
		const psAdded = new Promise<void>((resolveCb) => (resolveAdded = resolveCb))
		connManager.on('connectionAdded', () => {
			if (resolveAdded) resolveAdded()
		})

		let resolveRemoved: undefined | (() => void) = undefined
		const psRemoved = new Promise<void>((resolveCb) => (resolveRemoved = resolveCb))
		connManager.on('connectionRemoved', () => {
			if (resolveRemoved) resolveRemoved()
		})

		connManager.setConnections(OSC_CONFIG)

		await psAdded

		expect(ConstructedMockDevices['osc0']).toBeTruthy()

		connManager.setConnections({})

		await psRemoved

		expect(ConstructedMockDevices['osc0']).toBeFalsy()
	})
})

describe('ConnectionManager connection status', () => {
	function setup() {
		const connManager = new ConnectionManager(new DevicesRegistry())
		connManager.on('error', () => null)
		connManager.on('warning', () => null)

		const statuses: DeviceStatus[] = []
		connManager.on('connectionEvent:connectionChanged', (_id, status) => statuses.push(status))

		return { connManager, statuses }
	}

	async function waitFor(connManager: ConnectionManager, event: 'connectionInitialised' | 'connectionRemoved') {
		return new Promise<void>((resolve) => connManager.once(event, () => resolve()))
	}

	test('reconciles the device status once the connection is initialised', async () => {
		const { connManager, statuses } = setup()

		const psInitialised = waitFor(connManager, 'connectionInitialised')
		connManager.setConnections(oscConfig('osc-reconcile'))
		await psInitialised
		// the status is reconciled after 'connectionInitialised' is emitted
		await new Promise((resolve) => setImmediate(resolve))

		expect(statuses).toContainEqual(expect.objectContaining({ statusCode: StatusCode.GOOD }))

		const psRemoved = waitFor(connManager, 'connectionRemoved')
		connManager.setConnections({})
		await psRemoved
	}, 15000)

	test('reports a BAD status when the connection is removed', async () => {
		const { connManager, statuses } = setup()

		const psInitialised = waitFor(connManager, 'connectionInitialised')
		connManager.setConnections(oscConfig('osc-removed'))
		await psInitialised

		statuses.length = 0

		const psRemoved = waitFor(connManager, 'connectionRemoved')
		connManager.setConnections({})
		await psRemoved

		expect(statuses).toContainEqual(expect.objectContaining({ statusCode: StatusCode.BAD, active: false }))
	}, 15000)

	test('reports a BAD status when the connection fails to initialise', async () => {
		const { connManager, statuses } = setup()

		const psRemoved = waitFor(connManager, 'connectionRemoved')
		connManager.on('connectionAdded', (id) => {
			ConstructedMockDevices[id].initDevice.mockRejectedValue(new Error('init failed'))
		})
		connManager.setConnections(oscConfig('osc-failed'))
		await psRemoved

		expect(statuses).toContainEqual(expect.objectContaining({ statusCode: StatusCode.BAD, active: false }))
	}, 15000)
})
