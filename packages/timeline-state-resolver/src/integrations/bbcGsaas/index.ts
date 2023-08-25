import { CommandWithContext, Device } from '../../service/device'
import {
	ActionExecutionResult,
	ActionExecutionResultCode,
	DeviceStatus,
	StatusCode,
	TSRTimelineContent,
	Timeline,
	BBCGSAASOptions,
	TimelineContentTypeBBCGSAAS,
	BbcGsaasActions,
	Mappings,
	Mapping,
	SomeMappingBbcGsaas,
	DeviceType,
	MappingBbcGsaasType,
} from 'timeline-state-resolver-types'

import CacheableLookup from 'cacheable-lookup'
import { isEqual, omit } from 'underscore'
import got, { OptionsOfJSONResponseBody, RequestError } from 'got'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'

export type BBCGSAASDeviceState = {
	[group: string]: {
		[channel: string]: {
			scenes: {
				tlObjId?: string
				'*'?: string
				[id: string]: string | undefined
			}
			data: {
				[zone: string]: {
					tlObjId: string
					take: {
						[key: string]: any
					}
					clear: {
						[key: string]: any
					}
				}
			}
		}
	}
}

export interface BBCGSAASDeviceCommand extends CommandWithContext {
	command: {
		type: TimelineContentTypeBBCGSAAS
		group: string
		channel: string
		payload?: Record<string, any>
	}
}

export class BBCGSAASDevice extends Device<BBCGSAASOptions, BBCGSAASDeviceState, BBCGSAASDeviceCommand> {
	private options: BBCGSAASOptions
	//private activeLayers = new Map<string, string>()
	private cacheable: CacheableLookup
	private _terminated = false

	async init(options: BBCGSAASOptions): Promise<boolean> {
		this.options = {
			...options,
			brokerUrl: options.brokerUrl.endsWith('/') ? options.brokerUrl : `${options.brokerUrl}/`,
		}
		this.cacheable = new CacheableLookup()
		return true
	}
	async terminate(): Promise<void> {
		this._terminated = true
	}

	get connected(): boolean {
		return false
	}
	getStatus(): Omit<DeviceStatus, 'active'> {
		return {
			statusCode: StatusCode.GOOD,
			messages: [],
		}
	}

	actions: Record<string, (id: BbcGsaasActions, payload?: Record<string, any>) => Promise<ActionExecutionResult>> = {
		[BbcGsaasActions.Resync]: async () => {
			this.context.resetResolver()
			return { result: ActionExecutionResultCode.Ok }
		},
	}

	/*private async sendManualCommand(cmd?: HTTPSendCommandContent): Promise<ActionExecutionResult> {
		if (!cmd)
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command: Missing upayloadrl'),
			}
		if (!cmd.url) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command: Missing url'),
			}
		}
		if (!Object.values<TimelineContentTypeHTTP>(TimelineContentTypeHTTP).includes(cmd.type)) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command: type is invalid'),
			}
		}
		if (!cmd.params) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command: Missing params'),
			}
		}
		if (cmd.paramsType && !(cmd.type in TimelineContentTypeHTTPParamType)) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Failed to send command: params type is invalid'),
			}
		}

		await this.sendCommand({
			tlObjId: '',
			context: 'makeReady',
			command: {
				commandName: 'manual',
				content: cmd,
				layer: '',
			},
		}).catch(() => this.emit('warning', 'Manual command failed: ' + JSON.stringify(cmd)))

		return {
			result: ActionExecutionResultCode.Ok,
		}
	}*/

	convertTimelineStateToDeviceState(
		state: Timeline.TimelineState<TSRTimelineContent>,
		mappings: Mappings
	): BBCGSAASDeviceState {
		const newState: BBCGSAASDeviceState = {}

		for (const layer of Object.keys(state.layers)) {
			if (!mappings[layer]) continue
			const mapping = mappings[layer] as Mapping<SomeMappingBbcGsaas>
			const { group, channel, mappingType } = mapping.options

			const { content, id } = state.layers[layer]

			if (!newState[group]) {
				newState[group] = {
					[channel]: {
						scenes: {},
						data: {},
					},
				}
			} else if (!newState[group][channel]) {
				newState[group][channel] = {
					scenes: {},
					data: {},
				}
			}
			if (content.deviceType === DeviceType.BBC_GSAAS && mapping) {
				switch (content.type) {
					case TimelineContentTypeBBCGSAAS.LOAD:
						if (mappingType !== MappingBbcGsaasType.Channel) {
							continue
						}
						newState[group][channel] = {
							scenes: {
								...content.scenes,
								tlObjId: id,
							},
							data: {},
						}
						continue

					case TimelineContentTypeBBCGSAAS.UPDATE:
						if (mappingType !== MappingBbcGsaasType.Zone) {
							continue
						}
						newState[group][channel].data[mapping.options.zone] = {
							tlObjId: id,
							take: content.take,
							clear: content.clear,
						}
						continue

					case TimelineContentTypeBBCGSAAS.UNLOAD:
						if (mappingType !== MappingBbcGsaasType.Channel) {
							continue
						}
						newState[group][channel] = {
							scenes: {
								tlObjId: id,
							},
							data: {},
						}
						continue
				}
			}
		}
		return newState
	}

	diffStates(oldState: BBCGSAASDeviceState | undefined, newState: BBCGSAASDeviceState): Array<BBCGSAASDeviceCommand> {
		const loadCommands: Array<BBCGSAASDeviceCommand> = []
		const sceneCommands: Array<BBCGSAASDeviceCommand> = []
		const unloadCommands: Array<BBCGSAASDeviceCommand> = []

		for (const groupId of Object.keys(newState)) {
			if (oldState && oldState[groupId]) {
				// Group already exists
				for (const channelId of Object.keys(newState[groupId])) {
					const newChannel = newState[groupId][channelId]
					if (oldState[groupId][channelId]) {
						// Channel already exists.
						const oldChannel = oldState[groupId][channelId]

						// No keys means unload everything.
						if (Object.keys(newChannel.scenes).length === 0) {
							unloadCommands.push({
								timelineObjId: newChannel.scenes.tlObjId ?? '',
								context: `Unloaded scenes for channel ${channelId} in group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UNLOAD,
									group: groupId,
									channel: channelId,
								},
							})
						} else if (!isEqual(omit(oldChannel.scenes, 'tlObjId'), omit(newChannel.scenes, 'tlObjId'))) {
							loadCommands.push({
								timelineObjId: newChannel.scenes.tlObjId ?? '',
								context: `Updated scenes for channel ${channelId} in group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.LOAD,
									group: groupId,
									channel: channelId,
									payload: {
										scenes: omit(newChannel.scenes, 'tlObjId'),
									},
								},
							})
						}

						// Update zone if either if the take payload has changed.
						for (const zoneId of Object.keys(newChannel.data)) {
							const zone = newState[groupId][channelId].data[zoneId]
							if (oldState[groupId][channelId].data[zoneId]) {
								const oldZone = oldState[groupId][channelId].data[zoneId]
								if (!isEqual(zone.take, oldZone.take)) {
									sceneCommands.push({
										timelineObjId: newChannel.scenes.tlObjId ?? '',
										context: `Updated zone ${zoneId} for channel ${channelId} in group ${groupId}`,
										command: {
											type: TimelineContentTypeBBCGSAAS.UPDATE,
											group: groupId,
											channel: channelId,
											payload: {
												data: zone.take,
											},
										},
									})
								}
							} else {
								sceneCommands.push({
									timelineObjId: newChannel.scenes.tlObjId ?? '',
									context: `Added zone ${zoneId} for channel ${channelId} in group ${groupId}`,
									command: {
										type: TimelineContentTypeBBCGSAAS.UPDATE,
										group: groupId,
										channel: channelId,
										payload: {
											data: zone.take,
										},
									},
								})
							}
						}
					} else {
						// New channel.
						if (newChannel.scenes) {
							loadCommands.push({
								timelineObjId: newChannel.scenes.tlObjId ?? '',
								context: `Added channel ${channelId} to existing group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.LOAD,
									group: groupId,
									channel: channelId,
									payload: {
										scenes: omit(newChannel.scenes, 'tlObjId'),
									},
								},
							})
						}
						if (newChannel.data) {
							for (const zoneId of Object.keys(newChannel.data)) {
								const zone = newState[groupId][channelId].data[zoneId]
								sceneCommands.push({
									timelineObjId: zone.tlObjId ?? '',
									context: `Added channel ${channelId} and zone ${zoneId} to existing group ${groupId}`,
									command: {
										type: TimelineContentTypeBBCGSAAS.UPDATE,
										group: groupId,
										channel: channelId,
										payload: {
											data: zone.take,
										},
									},
								})
							}
						}
					}
				}
			} else {
				// New group.
				for (const channelId of Object.keys(newState[groupId])) {
					const newChannel = newState[groupId][channelId]
					if (newChannel.scenes) {
						loadCommands.push({
							timelineObjId: newChannel.scenes.tlObjId ?? '',
							context: `Added group ${groupId} and channel ${channelId}`,
							command: {
								type: TimelineContentTypeBBCGSAAS.LOAD,
								group: groupId,
								channel: channelId,
								payload: {
									scenes: omit(newChannel.scenes, 'tlObjId'),
								},
							},
						})
					}
					if (newChannel.data) {
						for (const zoneId of Object.keys(newChannel.data)) {
							const zone = newState[groupId][channelId].data[zoneId]
							sceneCommands.push({
								timelineObjId: zone.tlObjId ?? '',
								context: `Added group ${groupId} and channel ${channelId} and zone ${zoneId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UPDATE,
									group: groupId,
									channel: channelId,
									payload: {
										data: zone.take,
									},
								},
							})
						}
					}
				}
			}
		}

		if (oldState) {
			for (const groupId of Object.keys(oldState)) {
				if (newState[groupId]) {
					for (const channelId of Object.keys(oldState[groupId])) {
						const oldChannel = oldState[groupId][channelId]
						if (newState[groupId][channelId]) {
							const newChannel = newState[groupId][channelId]
							for (const zoneId of Object.keys(oldChannel.data)) {
								if (!newChannel.data[zoneId]) {
									const oldZone = oldChannel.data[zoneId]
									sceneCommands.push({
										timelineObjId: oldZone.tlObjId ?? '',
										context: `Removed zone ${zoneId} from channel ${channelId} from group ${groupId}`,
										command: {
											type: TimelineContentTypeBBCGSAAS.UPDATE,
											group: groupId,
											channel: channelId,
											payload: {
												data: oldZone.clear,
											},
										},
									})
								}
							}
						} else {
							unloadCommands.push({
								timelineObjId: oldChannel.scenes.tlObjId ?? '',
								context: `Removed channel ${channelId} from group ${groupId}`,
								command: {
									type: TimelineContentTypeBBCGSAAS.UNLOAD,
									group: groupId,
									channel: channelId,
								},
							})
						}
					}
				} else {
					for (const channelId of Object.keys(oldState[groupId])) {
						const oldChannel = oldState[groupId][channelId]
						unloadCommands.push({
							timelineObjId: oldChannel.scenes.tlObjId ?? '',
							context: `Removed channel ${channelId} from group ${groupId}`,
							command: {
								type: TimelineContentTypeBBCGSAAS.UNLOAD,
								group: groupId,
								channel: channelId,
							},
						})
					}
				}
			}
		}

		return [...unloadCommands, ...loadCommands, ...sceneCommands]
	}

	async sendCommand({ timelineObjId, context, command }: BBCGSAASDeviceCommand): Promise<void> {
		if (this._terminated) {
			return Promise.resolve()
		}

		const cwc: CommandWithContext = {
			context,
			command,
			timelineObjId,
		}
		this.context.logger.debug({ context, timelineObjId, command })

		//const t = Date.now()

		const { apiKey, brokerUrl } = this.options
		const { group, channel, payload, type } = command

		let endpoint = brokerUrl + 'v2/'
		switch (type) {
			case TimelineContentTypeBBCGSAAS.LOAD:
				endpoint += 'load'
				break

			case TimelineContentTypeBBCGSAAS.UPDATE:
				endpoint += 'update'
				break

			case TimelineContentTypeBBCGSAAS.UNLOAD:
				endpoint += 'unload'
				break

			default:
				this.context.logger.warning(`BBC GSAAS - Invalid command type ${command.type} (${context})`)
				return Promise.resolve()
		}
		endpoint += `/${group}/${channel}`

		try {
			const options: OptionsOfJSONResponseBody = {
				dnsCache: this.cacheable,
				retry: 0,
				headers: {
					'api-key': apiKey,
				},
				json: payload,
			}

			const url = new URL(endpoint)
			if (url.protocol === 'http:' && this.options.httpProxy) {
				options.agent = {
					http: new HttpProxyAgent({
						proxy: this.options.httpProxy,
					}),
				}
			} else if (url.protocol === 'https:' && this.options.httpsProxy) {
				options.agent = {
					https: new HttpsProxyAgent({
						proxy: this.options.httpsProxy,
					}),
				}
			}

			const response = await got.post(url, options)

			if (response.statusCode >= 200 && response.statusCode <= 299) {
				this.context.logger.debug(
					`BBC GSAAS: ${type}: Good statuscode response on url "${endpoint}": ${response.statusCode} (${context})`
				)
			} else {
				this.context.logger.warning(
					`BBC GSAAS: ${type}: Bad statuscode response on url "${endpoint}": ${response.statusCode} (${context})`
				)
			}
		} catch (error) {
			const err = error as RequestError // make typescript happy

			this.context.logger.error(`BBC GSAAS response error on ${type} "${endpoint}" (${context})`, err)
			this.context.commandError(err, cwc)

			if ('code' in err) {
				/*const retryCodes = [
					'ETIMEDOUT',
					'ECONNRESET',
					'EADDRINUSE',
					'ECONNREFUSED',
					'EPIPE',
					'ENOTFOUND',
					'ENETUNREACH',
					'EHOSTUNREACH',
					'EAI_AGAIN',
				]

				if (retryCodes.includes(err.code) && this.options?.resendTime && command.commandName !== 'manual') {
					const timeLeft = Math.max(this.options.resendTime - (Date.now() - t), 0)
					setTimeout(() => {
						this.sendCommand({
							tlObjId,
							context,
							command: {
								...command,
								commandName: 'retry',
							},
						}).catch(() => null) // errors will be emitted
					}, timeLeft)
				}*/
			}
		}

		/*if (command.commandName === 'added' || command.commandName === 'changed') {
			this.activeLayers.set(command.layer, JSON.stringify(command.content))
		} else if (command.commandName === 'removed') {
			this.activeLayers.delete(command.layer)
		}

		if (command.layer && command.commandName !== 'manual') {
			const hash = this.activeLayers.get(command.layer)
			if (JSON.stringify(command.content) !== hash) return Promise.resolve() // command is no longer relevant to state
		}
		if (this._terminated) {
			return Promise.resolve()
		}

		const cwc: CommandWithContext = {
			context,
			command,
			tlObjId,
		}
		this.emit('debug', { context, tlObjId, command })

		const t = Date.now()

		const httpReq = got[command.content.type]
		try {
			const options: OptionsOfTextResponseBody = {
				dnsCache: this.cacheable,
				retry: 0,
				headers: command.content.headers,
			}

			const url = new URL(command.content.url)
			if (!this.options.noProxy?.includes(url.host)) {
				if (url.protocol === 'http:' && this.options.httpProxy) {
					options.agent = {
						http: new HttpProxyAgent({
							proxy: this.options.httpProxy,
						}),
					}
				} else if (url.protocol === 'https:' && this.options.httpsProxy) {
					options.agent = {
						https: new HttpsProxyAgent({
							proxy: this.options.httpsProxy,
						}),
					}
				}
			}

			const params =
				'params' in command.content && !_.isEmpty(command.content.params) ? command.content.params : undefined
			if (params) {
				if (command.content.type === TimelineContentTypeHTTP.GET) {
					options.searchParams = params as Record<string, any>
				} else {
					if (command.content.paramsType === TimelineContentTypeHTTPParamType.FORM) {
						options.form = params
					} else {
						// Default is json:
						options.json = params
					}
				}
			}

			const response = await httpReq(command.content.url, options)

			if (response.statusCode === 200) {
				this.emit(
					'debug',
					`HTTPSend: ${command.content.type}: Good statuscode response on url "${command.content.url}": ${response.statusCode} (${context})`
				)
			} else {
				this.emit(
					'warning',
					`HTTPSend: ${command.content.type}: Bad statuscode response on url "${command.content.url}": ${response.statusCode} (${context})`
				)
			}
		} catch (error) {
			const err = error as RequestError // make typescript happy

			this.emit(
				'error',
				`HTTPSend.response error on ${command.content.type} "${command.content.url}" (${context})`,
				err
			)
			this.emit('commandError', err, cwc)

			if ('code' in err) {
				const retryCodes = [
					'ETIMEDOUT',
					'ECONNRESET',
					'EADDRINUSE',
					'ECONNREFUSED',
					'EPIPE',
					'ENOTFOUND',
					'ENETUNREACH',
					'EHOSTUNREACH',
					'EAI_AGAIN',
				]

				if (retryCodes.includes(err.code) && this.options?.resendTime && command.commandName !== 'manual') {
					const timeLeft = Math.max(this.options.resendTime - (Date.now() - t), 0)
					setTimeout(() => {
						this.sendCommand({
							tlObjId,
							context,
							command: {
								...command,
								commandName: 'retry',
							},
						}).catch(() => null) // errors will be emitted
					}, timeLeft)
				}
			}
		}*/
	}
}
