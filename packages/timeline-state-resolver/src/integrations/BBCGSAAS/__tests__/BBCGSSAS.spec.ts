/* eslint-disable jest/expect-expect */
import {
	TimelineContentTypeBBCGSAAS,
	ClearAllPayload,
	ClearZonePayload,
	ActionExecutionResultCode,
	ContinuePayload,
	DeviceType,
	TimelineContentBBCGSAASLoad,
	TimelineContentBBCGSAASUpdate,
	MappingBBCGSAASZone,
	MappingBBCGSAASType,
	MappingBBCGSAASChannel,
} from 'timeline-state-resolver-types'

const MOCKED_SOCKET_POST = jest.fn()

jest.mock('got', () => {
	return {
		default: {
			post: MOCKED_SOCKET_POST,
		},
	}
})

// note - this import should be below the got mock
import { BBCGSAASDevice, BBCGSAASDeviceCommand, BBCGSAASDeviceState } from '..'
import { getDeviceContext } from '../../__tests__/testlib'
import { literal } from '../../../lib'

async function getInitialisedBbcGsaasDevice() {
	const dev = new BBCGSAASDevice(getDeviceContext())
	await dev.init({
		brokerUrl: 'http://test',
		clientId: DEFAULT_CLIENT_ID,
	})
	return dev
}

describe('BBC-GSAAS', () => {
	beforeEach(() => {
		MOCKED_SOCKET_POST.mockReset()

		MOCKED_SOCKET_POST.mockResolvedValue(Promise.resolve({ statusCode: 200 }))
	})

	describe('convert timeline', () => {
		test('load', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			const result = device.convertTimelineStateToDeviceState(
				{
					time: 10,
					nextEvents: [],
					layers: {
						[DEFAULT_CHANNEL]: {
							id: 'testId',
							content: literal<TimelineContentBBCGSAASLoad>({
								deviceType: DeviceType.BBC_GSAAS,
								type: TimelineContentTypeBBCGSAAS.LOAD,
								control: {
									[DEFAULT_CLIENT_ID]: {
										permissions: ['load'],
										priority: DEFAULT_CLIENT_PRIORITY,
									},
								},
								scenes: {
									'*': DEFAULT_SCENE,
								},
							}),
						} as any,
					},
				},
				{
					[DEFAULT_CHANNEL]: {
						options: literal<MappingBBCGSAASChannel>({
							mappingType: MappingBBCGSAASType.Channel,
							group: DEFAULT_GROUP,
							channel: DEFAULT_CHANNEL,
						}),
					} as any,
				}
			)

			expect(result).toStrictEqual({
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testId',
						control: {
							testClient: {
								permissions: ['load'],
								priority: 1,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {},
					},
				},
			})
		})

		test('update', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			const result = device.convertTimelineStateToDeviceState(
				{
					time: 10,
					nextEvents: [],
					layers: {
						[DEFAULT_ZONE]: {
							id: 'testId',
							content: literal<TimelineContentBBCGSAASUpdate>({
								deviceType: DeviceType.BBC_GSAAS,
								type: TimelineContentTypeBBCGSAAS.UPDATE,
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							}),
						} as any,
					},
				},
				{
					[DEFAULT_ZONE]: {
						options: literal<MappingBBCGSAASZone>({
							mappingType: MappingBBCGSAASType.Zone,
							group: DEFAULT_GROUP,
							channel: DEFAULT_CHANNEL,
							zone: DEFAULT_ZONE,
						}),
					} as any,
				}
			)

			expect(result).toStrictEqual({
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						control: {},
						scenes: {},
						zones: {
							[DEFAULT_ZONE]: {
								tlObjId: 'testId',
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							},
						},
					},
				},
			})
		})

		test('load and update', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			const result = device.convertTimelineStateToDeviceState(
				{
					time: 10,
					nextEvents: [],
					layers: {
						[DEFAULT_CHANNEL]: {
							id: 'testLoadId',
							content: literal<TimelineContentBBCGSAASLoad>({
								deviceType: DeviceType.BBC_GSAAS,
								type: TimelineContentTypeBBCGSAAS.LOAD,
								control: {
									[DEFAULT_CLIENT_ID]: {
										permissions: ['load'],
										priority: DEFAULT_CLIENT_PRIORITY,
									},
								},
								scenes: {
									'*': DEFAULT_SCENE,
								},
							}),
						} as any,
						[DEFAULT_ZONE]: {
							id: 'testUpdateId',
							content: literal<TimelineContentBBCGSAASUpdate>({
								deviceType: DeviceType.BBC_GSAAS,
								type: TimelineContentTypeBBCGSAAS.UPDATE,
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							}),
						} as any,
					},
				},
				{
					[DEFAULT_CHANNEL]: {
						options: literal<MappingBBCGSAASChannel>({
							mappingType: MappingBBCGSAASType.Channel,
							group: DEFAULT_GROUP,
							channel: DEFAULT_CHANNEL,
						}),
					} as any,
					[DEFAULT_ZONE]: {
						options: literal<MappingBBCGSAASZone>({
							mappingType: MappingBBCGSAASType.Zone,
							group: DEFAULT_GROUP,
							channel: DEFAULT_CHANNEL,
							zone: DEFAULT_ZONE,
						}),
					} as any,
				}
			)

			expect(result).toStrictEqual({
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							testClient: {
								permissions: ['load'],
								priority: 1,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {
							[DEFAULT_ZONE]: {
								tlObjId: 'testUpdateId',
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							},
						},
					},
				},
			})
		})
	})

	describe('diffState', () => {
		async function compareStates(
			oldDevState: BBCGSAASDeviceState | undefined,
			newDevState: BBCGSAASDeviceState,
			expCommands: BBCGSAASDeviceCommand[]
		) {
			const device = await getInitialisedBbcGsaasDevice()

			const commands = device.diffStates(oldDevState, newDevState)

			expect(commands).toEqual(expCommands)
		}

		test('From undefined', async () => {
			await compareStates(undefined, {}, [])
		})

		test('empty states', async () => {
			await compareStates({}, {}, [])
		})

		test('new load command', async () => {
			const newState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {},
					},
				},
			}
			await compareStates({}, newState, [
				{
					timelineObjId: 'testLoadId',
					context: `Added group ${DEFAULT_GROUP} and channel ${DEFAULT_CHANNEL}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.LOAD,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							control: {
								[DEFAULT_CLIENT_ID]: {
									permissions: ['load'],
									priority: DEFAULT_CLIENT_PRIORITY,
								},
							},
							scenes: {
								'*': DEFAULT_SCENE,
							},
						},
					},
				},
			])
		})

		test('new unload command', async () => {
			const oldState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {},
					},
				},
			}
			await compareStates(oldState, {}, [
				{
					timelineObjId: 'testLoadId',
					context: `Removed channel ${DEFAULT_CHANNEL} from group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UNLOAD,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
					},
				},
			])
		})

		test('changed load command', async () => {
			const oldState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {},
					},
				},
			}
			const newState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'anotherLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
							testId: {
								name: 'anotherTestScene',
								updateMode: 'aMode',
								startupDelay: 0,
								throttle: 0,
							},
						},
						zones: {},
					},
				},
			}
			await compareStates(oldState, newState, [
				{
					timelineObjId: 'anotherLoadId',
					context: `Updated scenes for channel ${DEFAULT_CHANNEL} in group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.LOAD,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							control: {
								[DEFAULT_CLIENT_ID]: {
									permissions: ['load'],
									priority: DEFAULT_CLIENT_PRIORITY,
								},
							},
							scenes: {
								'*': DEFAULT_SCENE,
								testId: {
									name: 'anotherTestScene',
									updateMode: 'aMode',
									startupDelay: 0,
									throttle: 0,
								},
							},
						},
					},
				},
			])
		})

		test('new update command', async () => {
			const oldState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {},
					},
				},
			}
			const newState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {
							[DEFAULT_ZONE]: {
								tlObjId: 'testUpdateId',
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
											component: 'testComponent',
											props: {
												key: 'clearValue',
											},
										},
									},
								},
							},
						},
					},
				},
			}
			await compareStates(oldState, newState, [
				{
					timelineObjId: 'testUpdateId',
					context: `Added zone ${DEFAULT_ZONE} for channel ${DEFAULT_CHANNEL} in group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UPDATE,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							id: 'itemId',
							zones: {
								[DEFAULT_ZONE]: {
									action: 'TAKE',
									component: 'testComponent',
									props: {
										key: 'takeValue',
									},
								},
							},
						},
					},
				},
			])
		})

		test('changed update command', async () => {
			const oldState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {
							[DEFAULT_ZONE]: {
								tlObjId: 'testUpdateId',
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
											component: 'testComponent',
											props: {
												key: 'clearValue',
											},
										},
									},
								},
							},
						},
					},
				},
			}
			const newState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {
							[DEFAULT_ZONE]: {
								tlObjId: 'anotherTestUpdateId',
								take: {
									id: 'anotherItemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
												anotherKey: 'anotherValue',
											},
										},
									},
								},
								clear: {
									id: 'anotherItemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
											component: 'testComponent',
											props: {
												key: 'clearValue',
											},
										},
									},
								},
							},
						},
					},
				},
			}
			await compareStates(oldState, newState, [
				{
					timelineObjId: 'anotherTestUpdateId',
					context: `Updated zone ${DEFAULT_ZONE} for channel ${DEFAULT_CHANNEL} in group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UPDATE,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							id: 'anotherItemId',
							zones: {
								[DEFAULT_ZONE]: {
									action: 'TAKE',
									component: 'testComponent',
									props: {
										key: 'takeValue',
										anotherKey: 'anotherValue',
									},
								},
							},
						},
					},
				},
			])
		})

		test('removed update command', async () => {
			const oldState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {
							[DEFAULT_ZONE]: {
								tlObjId: 'testUpdateId',
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							},
						},
					},
				},
			}
			const newState: BBCGSAASDeviceState = {
				[DEFAULT_GROUP]: {
					[DEFAULT_CHANNEL]: {
						tlObjId: 'testLoadId',
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
						zones: {},
					},
				},
			}
			await compareStates(oldState, newState, [
				{
					timelineObjId: 'testUpdateId',
					context: `Removed zone ${DEFAULT_ZONE} from channel ${DEFAULT_CHANNEL} from group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UPDATE,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							id: 'itemId',
							zones: {
								[DEFAULT_ZONE]: {
									action: 'CLEAR',
								},
							},
						},
					},
				},
			])
		})
	})

	describe('send commands', () => {
		test('load message', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			device
				.sendCommand({
					timelineObjId: 'testLoadId',
					context: `Added group ${DEFAULT_GROUP} and channel ${DEFAULT_CHANNEL}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.LOAD,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							control: {
								[DEFAULT_CLIENT_ID]: {
									permissions: ['load'],
									priority: DEFAULT_CLIENT_PRIORITY,
								},
							},
							scenes: {
								'*': DEFAULT_SCENE,
							},
						},
					},
				})
				.catch((e) => {
					throw e
				})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/load/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
					json: {
						control: {
							[DEFAULT_CLIENT_ID]: {
								permissions: ['load'],
								priority: DEFAULT_CLIENT_PRIORITY,
							},
						},
						scenes: {
							'*': DEFAULT_SCENE,
						},
					},
				})
			)
		})

		test('unload message', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			device
				.sendCommand({
					timelineObjId: 'testLoadId',
					context: `Removed channel ${DEFAULT_CHANNEL} from group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UNLOAD,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
					},
				})
				.catch((e) => {
					throw e
				})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/unload/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
				})
			)
		})

		test('update message', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			device
				.sendCommand({
					timelineObjId: 'testUpdateId',
					context: `Added zone ${DEFAULT_ZONE} for channel ${DEFAULT_CHANNEL} in group ${DEFAULT_GROUP}`,
					command: {
						type: TimelineContentTypeBBCGSAAS.UPDATE,
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						payload: {
							id: 'itemId',
							zones: {
								[DEFAULT_ZONE]: {
									action: 'TAKE',
									component: 'testComponent',
									props: {
										key: 'takeValue',
									},
								},
							},
						},
					},
				})
				.catch((e) => {
					throw e
				})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/update/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
					json: {
						id: 'itemId',
						zones: {
							[DEFAULT_ZONE]: {
								action: 'TAKE',
								component: 'testComponent',
								props: {
									key: 'takeValue',
								},
							},
						},
					},
				})
			)
		})
	})

	describe('actions', () => {
		test('clear all action', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			const result = await device.actions
				.clearAll('clearAll', {
					group: DEFAULT_GROUP,
					channel: DEFAULT_CHANNEL,
				} as ClearAllPayload)
				.catch((e) => {
					throw e
				})

			expect(result).toStrictEqual({
				result: ActionExecutionResultCode.Ok,
			})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/clearAll/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
				})
			)
		})

		test('clear all action bad status code', async () => {
			MOCKED_SOCKET_POST.mockResolvedValueOnce({ statusCode: 403 })

			const device = await getInitialisedBbcGsaasDevice()

			const result = await device.actions
				.clearAll('clearAll', {
					group: DEFAULT_GROUP,
					channel: DEFAULT_CHANNEL,
				} as ClearAllPayload)
				.catch((e) => {
					throw e
				})

			expect(result).toMatchObject({
				result: ActionExecutionResultCode.Error,
			})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/clearAll/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
				})
			)
		})

		test('clear all action failed', async () => {
			MOCKED_SOCKET_POST.mockRejectedValueOnce({ code: 'ECONNREFUSED' })

			const device = await getInitialisedBbcGsaasDevice()

			const result = await device.actions
				.clearAll('clearAll', {
					group: DEFAULT_GROUP,
					channel: DEFAULT_CHANNEL,
				} as ClearAllPayload)
				.catch((e) => {
					throw e
				})

			expect(result).toMatchObject({
				result: ActionExecutionResultCode.Error,
			})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/clearAll/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
				})
			)
		})

		test('clear zone action', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			device.convertTimelineStateToDeviceState(
				{
					time: 10,
					nextEvents: [],
					layers: {
						[DEFAULT_ZONE]: {
							id: 'testId',
							content: literal<TimelineContentBBCGSAASUpdate>({
								deviceType: DeviceType.BBC_GSAAS,
								type: TimelineContentTypeBBCGSAAS.UPDATE,
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							}),
						} as any,
					},
				},
				{
					[DEFAULT_ZONE]: {
						options: literal<MappingBBCGSAASZone>({
							mappingType: MappingBBCGSAASType.Zone,
							group: DEFAULT_GROUP,
							channel: DEFAULT_CHANNEL,
							zone: DEFAULT_ZONE,
						}),
					} as any,
				}
			)

			const result = await device.actions
				.clearZone(
					'clearZone',
					literal<ClearZonePayload>({
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						zone: DEFAULT_ZONE,
					})
				)
				.catch((e) => {
					throw e
				})

			expect(result).toStrictEqual({
				result: ActionExecutionResultCode.Ok,
			})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/update/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
					json: {
						id: 'itemId',
						zones: {
							[DEFAULT_ZONE]: {
								action: 'CLEAR',
							},
						},
					},
				})
			)
		})

		test('clear zone action where no zone is set', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			device.convertTimelineStateToDeviceState(
				{
					time: 10,
					nextEvents: [],
					layers: {
						[DEFAULT_ZONE]: {
							id: 'testId',
							content: literal<TimelineContentBBCGSAASUpdate>({
								deviceType: DeviceType.BBC_GSAAS,
								type: TimelineContentTypeBBCGSAAS.UPDATE,
								take: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'TAKE',
											component: 'testComponent',
											props: {
												key: 'takeValue',
											},
										},
									},
								},
								clear: {
									id: 'itemId',
									zones: {
										[DEFAULT_ZONE]: {
											action: 'CLEAR',
										},
									},
								},
							}),
						} as any,
					},
				},
				{
					[DEFAULT_ZONE]: {
						options: literal<MappingBBCGSAASZone>({
							mappingType: MappingBBCGSAASType.Zone,
							group: DEFAULT_GROUP,
							channel: DEFAULT_CHANNEL,
							zone: DEFAULT_ZONE,
						}),
					} as any,
				}
			)

			const result = await device.actions
				.clearZone(
					'clearZone',
					literal<ClearZonePayload>({
						group: DEFAULT_GROUP,
						channel: DEFAULT_CHANNEL,
						zone: 'anotherZone',
					})
				)
				.catch((e) => {
					throw e
				})

			expect(result).toStrictEqual({
				result: ActionExecutionResultCode.Ok,
			})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(0)
		})

		test('continue action', async () => {
			const device = await getInitialisedBbcGsaasDevice()

			const result = await device.actions
				.continue('continue', {
					group: DEFAULT_GROUP,
					channel: DEFAULT_CHANNEL,
					zone: DEFAULT_ZONE,
				} as ContinuePayload)
				.catch((e) => {
					throw e
				})

			expect(result).toStrictEqual({
				result: ActionExecutionResultCode.Ok,
			})

			expect(MOCKED_SOCKET_POST).toHaveBeenCalledTimes(1)
			expect(MOCKED_SOCKET_POST).toHaveBeenCalledWith(
				expect.objectContaining({
					href: `http://test/v3/continue/${DEFAULT_GROUP}/${DEFAULT_CHANNEL}/${DEFAULT_ZONE}`,
				}),
				expect.objectContaining({
					headers: {
						ClientID: DEFAULT_CLIENT_ID,
					},
				})
			)
		})
	})
})

const DEFAULT_CLIENT_ID = 'testClient'
const DEFAULT_CLIENT_PRIORITY = 1
const DEFAULT_SCENE = {
	name: 'testScene',
	updateMode: 'testMode',
	startupDelay: 100,
	throttle: 200,
}
const DEFAULT_GROUP = 'testGroup'
const DEFAULT_CHANNEL = 'testChannel'
const DEFAULT_ZONE = 'testZone'
