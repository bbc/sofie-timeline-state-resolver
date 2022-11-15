import * as _ from 'underscore'
import { DeviceWithState, CommandWithContext, DeviceStatus, StatusCode } from './../../devices/device'

import {
	DeviceType,
	Mapping,
	MappingQuantel,
	QuantelOptions,
	TimelineObjQuantelClip,
	QuantelControlMode,
	ResolvedTimelineObjectInstanceExtended,
	QuantelOutTransition,
	DeviceOptionsQuantel,
	Mappings,
} from 'timeline-state-resolver-types'

import { TimelineState, ResolvedTimelineObjectInstance } from 'superfly-timeline'

import { DoOnTime, SendMode } from '../../devices/doOnTime'
import { QuantelGateway } from 'tv-automation-quantel-gateway-client'
import { startTrace, endTrace, t } from '../../lib'
import { QuantelManager } from './connection'
import {
	QuantelCommand,
	QuantelState,
	MappedPorts,
	QuantelStatePortClip,
	QuantelCommandType,
	QuantelStatePort,
} from './quantelInterfaces'
import { Actions } from './interfaces'
import { ActionExecutionResult, ActionExecutionResultCode } from 'timeline-state-resolver-types'
export { QuantelCommandType }

const IDEAL_PREPARE_TIME = 1000
const PREPARE_TIME_WAIT = 50

export interface DeviceOptionsQuantelInternal extends DeviceOptionsQuantel {
	commandReceiver?: CommandReceiver
}
export type CommandReceiver = (
	time: number,
	cmd: QuantelCommand,
	context: string,
	timelineObjId: string
) => Promise<any>
/**
 * This class is used to interface with a Quantel-gateway,
 * https://github.com/nrkno/tv-automation-quantel-gateway
 *
 * This device behaves a little bit different than the others, because a play-command is
 * a two-step rocket.
 * This is why the commands generated by the state-diff is not one-to-one related to the
 * actual commands sent to the Quantel-gateway.
 */
export class QuantelDevice extends DeviceWithState<QuantelState, DeviceOptionsQuantelInternal> {
	private _quantel: QuantelGateway
	private _quantelManager: QuantelManager

	private _commandReceiver: CommandReceiver

	private _doOnTime: DoOnTime
	private _doOnTimeBurst: DoOnTime
	private _initOptions?: QuantelOptions

	constructor(deviceId: string, deviceOptions: DeviceOptionsQuantelInternal, getCurrentTime: () => Promise<number>) {
		super(deviceId, deviceOptions, getCurrentTime)

		if (deviceOptions.options) {
			if (deviceOptions.commandReceiver) this._commandReceiver = deviceOptions.commandReceiver
			else this._commandReceiver = this._defaultCommandReceiver.bind(this)
		}
		this._quantel = new QuantelGateway()
		this._quantel.on('error', (e) => this.emit('error', 'Quantel.QuantelGateway', e))
		this._quantelManager = new QuantelManager(this._quantel, () => this.getCurrentTime(), {
			allowCloneClips: deviceOptions.options?.allowCloneClips,
		})
		this._quantelManager.on('info', (x) =>
			this.emit('info', `Quantel: ${typeof x === 'string' ? x : JSON.stringify(x)}`)
		)
		this._quantelManager.on('warning', (x) =>
			this.emit('warning', `Quantel: ${typeof x === 'string' ? x : JSON.stringify(x)}`)
		)
		this._quantelManager.on('error', (e) => this.emit('error', 'Quantel: ', e))
		this._quantelManager.on('debug', (...args) => this.emitDebug(...args))

		this._doOnTime = new DoOnTime(
			() => {
				return this.getCurrentTime()
			},
			SendMode.IN_ORDER,
			this._deviceOptions
		)
		this.handleDoOnTime(this._doOnTime, 'Quantel')

		this._doOnTimeBurst = new DoOnTime(
			() => {
				return this.getCurrentTime()
			},
			SendMode.BURST,
			this._deviceOptions
		)
		this.handleDoOnTime(this._doOnTimeBurst, 'Quantel.burst')
	}

	async init(initOptions: QuantelOptions): Promise<boolean> {
		this._initOptions = initOptions
		const ISAUrlMaster: string = this._initOptions.ISAUrlMaster || this._initOptions['ISAUrl'] // tmp: ISAUrl for backwards compatibility, to be removed later
		if (!this._initOptions.gatewayUrl) throw new Error('Quantel bad connection option: gatewayUrl')
		if (!ISAUrlMaster) throw new Error('Quantel bad connection option: ISAUrlMaster')
		if (!this._initOptions.serverId) throw new Error('Quantel bad connection option: serverId')

		const isaURLs: string[] = []
		if (ISAUrlMaster) isaURLs.push(ISAUrlMaster)
		if (this._initOptions.ISAUrlBackup) isaURLs.push(this._initOptions.ISAUrlBackup)

		await this._quantel.init(
			this._initOptions.gatewayUrl,
			isaURLs,
			this._initOptions.zoneId,
			this._initOptions.serverId
		)

		this._quantel.monitorServerStatus((_connected: boolean) => {
			this._connectionChanged()
		})

		return true
	}

	/**
	 * Terminates the device safely such that things can be garbage collected.
	 */
	async terminate(): Promise<boolean> {
		this._quantel.dispose()
		this._doOnTime.dispose()

		return true
	}
	/** Called by the Conductor a bit before a .handleState is called */
	prepareForHandleState(newStateTime: number) {
		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(newStateTime)
		this.cleanUpStates(0, newStateTime)
	}
	/**
	 * Generates an array of Quantel commands by comparing the newState against the oldState, or the current device state.
	 */
	handleState(newState: TimelineState, newMappings: Mappings) {
		super.onHandleState(newState, newMappings)
		// check if initialized:
		if (!this._quantel.initialized) {
			this.emit('warning', 'Quantel not initialized yet')
			return
		}

		this._quantel.setMonitoredPorts(this._getMappedPorts(newMappings))

		const previousStateTime = Math.max(this.getCurrentTime(), newState.time)

		const oldQuantelState: QuantelState = (this.getStateBefore(previousStateTime) || { state: { time: 0, port: {} } })
			.state

		const convertTrace = startTrace(`device:convertState`, { deviceId: this.deviceId })
		const newQuantelState = this.convertStateToQuantel(newState, newMappings)
		this.emit('timeTrace', endTrace(convertTrace))
		// let oldQuantelState = this.convertStateToQuantel(oldState)

		const diffTrace = startTrace(`device:diffState`, { deviceId: this.deviceId })
		const commandsToAchieveState = this._diffStates(oldQuantelState, newQuantelState, newState.time)
		this.emit('timeTrace', endTrace(diffTrace))

		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(previousStateTime)

		// add the new commands to the queue
		this._addToQueue(commandsToAchieveState)

		// store the new state, for later use:
		this.setState(newQuantelState, newState.time)
	}

	/**
	 * Attempts to restart the gateway
	 */
	async restartGateway() {
		if (this._quantel.connected) {
			return this._quantel.kill()
		} else {
			throw new Error('Quantel Gateway not connected')
		}
	}
	async executeAction(actionId: string, _payload?: Record<string, any> | undefined): Promise<ActionExecutionResult> {
		switch (actionId) {
			case Actions.RestartGateway:
				try {
					await this.restartGateway()
					return { result: ActionExecutionResultCode.Ok }
				} catch {
					return { result: ActionExecutionResultCode.Error }
				}
			default:
				return { result: ActionExecutionResultCode.Ok, response: t('Action "{{id}}" not found', { actionId }) }
		}
	}

	/**
	 * Clear any scheduled commands after this time
	 * @param clearAfterTime
	 */
	clearFuture(clearAfterTime: number) {
		this._doOnTime.clearQueueAfter(clearAfterTime)
	}
	get canConnect(): boolean {
		return true
	}
	get connected(): boolean {
		return this._quantel.connected
	}

	get deviceType() {
		return DeviceType.QUANTEL
	}
	get deviceName(): string {
		try {
			return `Quantel ${this._quantel.ISAUrl}/${this._quantel.zoneId}/${this._quantel.serverId}`
		} catch (e) {
			return `Quantel device (uninitialized)`
		}
	}

	get queue() {
		return this._doOnTime.getQueue()
	}
	private _getMappedPorts(mappings: Mappings): MappedPorts {
		const ports: MappedPorts = {}

		_.each(mappings, (mapping) => {
			if (
				mapping &&
				mapping.device === DeviceType.QUANTEL &&
				mapping.deviceId === this.deviceId &&
				_.has(mapping, 'portId') &&
				_.has(mapping, 'channelId')
			) {
				const qMapping: MappingQuantel = mapping as MappingQuantel

				if (!ports[qMapping.portId]) {
					ports[qMapping.portId] = {
						mode: qMapping.mode || QuantelControlMode.QUALITY,
						channels: [],
					}
				}

				ports[qMapping.portId].channels = _.sortBy(_.uniq(ports[qMapping.portId].channels.concat([qMapping.channelId])))
			}
		})
		return ports
	}

	/**
	 * Takes a timeline state and returns a Quantel State that will work with the state lib.
	 * @param timelineState The timeline state to generate from.
	 */
	convertStateToQuantel(timelineState: TimelineState, mappings: Mappings): QuantelState {
		const state: QuantelState = {
			time: timelineState.time,
			port: {},
		}
		// create ports from mappings:

		_.each(this._getMappedPorts(mappings), (port, portId: string) => {
			state.port[portId] = {
				channels: port.channels,
				timelineObjId: '',
				mode: port.mode,
				lookahead: false,
			}
		})

		_.each(timelineState.layers, (layer: ResolvedTimelineObjectInstance, layerName: string) => {
			const layerExt = layer as ResolvedTimelineObjectInstanceExtended
			let foundMapping: Mapping = mappings[layerName]

			let isLookahead = false
			if (!foundMapping && layerExt.isLookahead && layerExt.lookaheadForLayer) {
				foundMapping = mappings[layerExt.lookaheadForLayer]
				isLookahead = true
			}

			if (
				foundMapping &&
				foundMapping.device === DeviceType.QUANTEL &&
				foundMapping.deviceId === this.deviceId &&
				_.has(foundMapping, 'portId') &&
				_.has(foundMapping, 'channelId')
			) {
				const mapping: MappingQuantel = foundMapping as MappingQuantel

				const port: QuantelStatePort = state.port[mapping.portId]
				if (!port) throw new Error(`Port "${mapping.portId}" not found`)

				if (layer.content && (layer.content.title || layer.content.guid)) {
					const clip = layer as any as TimelineObjQuantelClip

					// Note on lookaheads:
					// If there is ONLY a lookahead on a port, it'll be treated as a "paused (real) clip"
					// If there is a lookahead alongside the a real clip, its fragments will be preloaded

					if (isLookahead) {
						port.lookaheadClip = {
							title: clip.content.title,
							guid: clip.content.guid,
							timelineObjId: layer.id,
						}
					}

					if (isLookahead && port.clip) {
						// There is already a non-lookahead on the port
						// Do nothing more with this then
					} else {
						const startTime = layer.instance.originalStart || layer.instance.start

						port.timelineObjId = layer.id
						port.notOnAir = layer.content.notOnAir || isLookahead
						port.outTransition = layer.content.outTransition
						port.lookahead = isLookahead

						port.clip = {
							title: clip.content.title,
							guid: clip.content.guid,
							// clipId // set later

							pauseTime: clip.content.pauseTime,
							playing: isLookahead ? false : clip.content.playing !== undefined ? clip.content.playing : true,

							inPoint: clip.content.inPoint,
							length: clip.content.length,

							playTime: (clip.content.noStarttime || isLookahead ? null : startTime) || null,
						}
					}
				}
			}
		})

		return state
	}

	/**
	 * Prepares the physical device for playout.
	 * @param okToDestroyStuff Whether it is OK to do things that affects playout visibly
	 */
	async makeReady(okToDestroyStuff?: boolean): Promise<void> {
		if (okToDestroyStuff) {
			// release and re-claim all ports:
			// TODO
		}
		// reset our own state(s):
		if (okToDestroyStuff) {
			this.clearStates()
		}
	}
	getStatus(): DeviceStatus {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (!this._quantel.connected) {
			statusCode = StatusCode.BAD
			messages.push('Not connected')
		}
		if (this._quantel.statusMessage) {
			statusCode = StatusCode.BAD
			messages.push(this._quantel.statusMessage)
		}

		if (!this._quantel.initialized) {
			statusCode = StatusCode.BAD
			messages.push(`Quantel device connection not initialized (restart required)`)
		}

		return {
			statusCode: statusCode,
			messages: messages,
			active: this.isActive,
		}
	}
	/**
	 * Compares the new timeline-state with the old one, and generates commands to account for the difference
	 */
	private _diffStates(oldState: QuantelState, newState: QuantelState, time: number): Array<QuantelCommand> {
		const highPrioCommands: QuantelCommand[] = []
		const lowPrioCommands: QuantelCommand[] = []

		const addCommand = (command: QuantelCommand, lowPriority: boolean) => {
			;(lowPriority ? lowPrioCommands : highPrioCommands).push(command)
		}
		const seenClips: { [identifier: string]: true } = {}
		const loadFragments = (
			portId: string,
			port: QuantelStatePort,
			clip: QuantelStatePortClip,
			timelineObjId: string,
			isPreloading: boolean
		) => {
			// Only load identical fragments once:
			const clipIdentifier = `${portId}:${clip.clipId}_${clip.guid}_${clip.title}`
			if (!seenClips[clipIdentifier]) {
				seenClips[clipIdentifier] = true
				addCommand(
					{
						type: QuantelCommandType.LOADCLIPFRAGMENTS,
						time: prepareTime,
						portId: portId,
						timelineObjId: timelineObjId,
						fromLookahead: isPreloading || port.lookahead,
						clip: clip,
						timeOfPlay: time,
						allowedToPrepareJump: !isPreloading,
					},
					isPreloading || port.lookahead
				)
			}
		}

		/** The time of when to run "preparation" commands */
		let prepareTime = Math.min(
			time,
			Math.max(
				time - IDEAL_PREPARE_TIME,
				oldState.time + PREPARE_TIME_WAIT // earliset possible prepareTime
			)
		)
		if (prepareTime < this.getCurrentTime()) {
			// Only to not emit an unnessesary slowCommand event
			prepareTime = this.getCurrentTime()
		}
		if (time < prepareTime) {
			prepareTime = time - 10
		}

		const lookaheadPreloadClips: {
			portId: string
			port: QuantelStatePort
			clip: QuantelStatePortClip
			timelineObjId: string
		}[] = []

		_.each(newState.port, (newPort: QuantelStatePort, portId: string) => {
			const oldPort = oldState.port[portId]

			if (!oldPort || !_.isEqual(newPort.channels, oldPort.channels)) {
				const channel = newPort.channels[0] as number | undefined
				if (channel !== undefined) {
					// todo: support for multiple channels
					addCommand(
						{
							type: QuantelCommandType.SETUPPORT,
							time: prepareTime,
							portId: portId,
							timelineObjId: newPort.timelineObjId,
							channel: channel,
						},
						newPort.lookahead
					)
				}
			}

			if (!oldPort || !_.isEqual(newPort.clip, oldPort.clip)) {
				if (newPort.clip) {
					// Load (and play) the clip:

					let transition: QuantelOutTransition | undefined

					if (oldPort && !oldPort.notOnAir && newPort.notOnAir) {
						// When the previous content was on-air, we use the out-transition (so that mix-effects look good).
						// But when the previous content wasn't on-air, we don't wan't to use the out-transition (for example; when cuing previews)
						transition = oldPort.outTransition
					}

					loadFragments(portId, newPort, newPort.clip, newPort.timelineObjId, false)
					if (newPort.clip.playing) {
						addCommand(
							{
								type: QuantelCommandType.PLAYCLIP,
								time: time,
								portId: portId,
								timelineObjId: newPort.timelineObjId,
								fromLookahead: newPort.lookahead,
								clip: newPort.clip,
								mode: newPort.mode,
								transition: transition,
							},
							newPort.lookahead
						)
					} else {
						addCommand(
							{
								type: QuantelCommandType.PAUSECLIP,
								time: time,
								portId: portId,
								timelineObjId: newPort.timelineObjId,
								fromLookahead: newPort.lookahead,
								clip: newPort.clip,
								mode: newPort.mode,
								transition: transition,
							},
							newPort.lookahead
						)
					}
				} else {
					addCommand(
						{
							type: QuantelCommandType.CLEARCLIP,
							time: time,
							portId: portId,
							timelineObjId: newPort.timelineObjId,
							fromLookahead: newPort.lookahead,
							transition: oldPort && oldPort.outTransition,
						},
						newPort.lookahead
					)
				}
			}
			if (!oldPort || !_.isEqual(newPort.lookaheadClip, oldPort.lookaheadClip)) {
				if (
					newPort.lookaheadClip &&
					(!newPort.clip ||
						newPort.lookaheadClip.clipId !== newPort.clip.clipId ||
						newPort.lookaheadClip.title !== newPort.clip.title ||
						newPort.lookaheadClip.guid !== newPort.clip.guid)
				) {
					// Also preload lookaheads later:
					lookaheadPreloadClips.push({
						portId: portId,
						port: newPort,
						clip: {
							...newPort.lookaheadClip,
							playTime: 0,
							playing: false,
						},
						timelineObjId: newPort.lookaheadClip.timelineObjId,
					})
				}
			}
		})

		_.each(oldState.port, (oldPort: QuantelStatePort, portId: string) => {
			const newPort = newState.port[portId]
			if (!newPort) {
				// removed port
				addCommand(
					{
						type: QuantelCommandType.RELEASEPORT,
						time: prepareTime,
						portId: portId,
						timelineObjId: oldPort.timelineObjId,
						fromLookahead: oldPort.lookahead,
					},
					oldPort.lookahead
				)
			}
		})
		// console.log('lookaheadPreloadClips', lookaheadPreloadClips)
		// Lookaheads to preload:
		_.each(lookaheadPreloadClips, (lookaheadPreloadClip) => {
			// Preloads of lookaheads are handled last, to ensure that any load-fragments of high-prio clips are done first.
			loadFragments(
				lookaheadPreloadClip.portId,
				lookaheadPreloadClip.port,
				lookaheadPreloadClip.clip,
				lookaheadPreloadClip.timelineObjId,
				true
			)
		})

		const allCommands = highPrioCommands.concat(lowPrioCommands)

		allCommands.sort((a, b) => {
			// Release ports should always be done first:
			if (a.type === QuantelCommandType.RELEASEPORT && b.type !== QuantelCommandType.RELEASEPORT) return -1
			if (a.type !== QuantelCommandType.RELEASEPORT && b.type === QuantelCommandType.RELEASEPORT) return 1
			return 0
		})
		return allCommands
	}
	private async _doCommand(command: QuantelCommand, context: string, timlineObjId: string): Promise<void> {
		const time = this.getCurrentTime()
		return this._commandReceiver(time, command, context, timlineObjId)
	}
	/**
	 * Add commands to queue, to be executed at the right time
	 */
	private _addToQueue(commandsToAchieveState: Array<QuantelCommand>) {
		_.each(commandsToAchieveState, (cmd: QuantelCommand) => {
			this._doOnTime.queue(
				cmd.time,
				cmd.portId,
				async (c: { cmd: QuantelCommand }) => {
					return this._doCommand(c.cmd, c.cmd.type + '_' + c.cmd.timelineObjId, c.cmd.timelineObjId)
				},
				{ cmd: cmd }
			)

			this._doOnTimeBurst.queue(
				cmd.time,
				undefined,
				async (c: { cmd: QuantelCommand }) => {
					if (
						(c.cmd.type === QuantelCommandType.PLAYCLIP || c.cmd.type === QuantelCommandType.PAUSECLIP) &&
						!c.cmd.fromLookahead
					) {
						this._quantelManager.clearAllWaitWithPort(c.cmd.portId)
					}
					return Promise.resolve()
				},
				{ cmd: cmd }
			)
		})
	}
	/**
	 * Sends commands to the Quantel ISA server
	 * @param time deprecated
	 * @param cmd Command to execute
	 */
	private async _defaultCommandReceiver(
		_time: number,
		cmd: QuantelCommand,
		context: string,
		timelineObjId: string
	): Promise<any> {
		const cwc: CommandWithContext = {
			context: context,
			timelineObjId: timelineObjId,
			command: cmd,
		}
		this.emitDebug(cwc)

		try {
			const cmdType = cmd.type
			if (cmd.type === QuantelCommandType.SETUPPORT) {
				await this._quantelManager.setupPort(cmd)
			} else if (cmd.type === QuantelCommandType.RELEASEPORT) {
				await this._quantelManager.releasePort(cmd)
			} else if (cmd.type === QuantelCommandType.LOADCLIPFRAGMENTS) {
				await this._quantelManager.tryLoadClipFragments(cmd)
			} else if (cmd.type === QuantelCommandType.PLAYCLIP) {
				await this._quantelManager.playClip(cmd)
			} else if (cmd.type === QuantelCommandType.PAUSECLIP) {
				await this._quantelManager.pauseClip(cmd)
			} else if (cmd.type === QuantelCommandType.CLEARCLIP) {
				await this._quantelManager.clearClip(cmd)
				this.getCurrentTime()
			} else {
				throw new Error(`Unsupported command type "${cmdType}"`)
			}
		} catch (e) {
			const error = e as Error
			let errorString = error && error.message ? error.message : error.toString()
			if (error?.stack) {
				errorString += error.stack
			}
			this.emit('commandError', new Error(errorString), cwc)
		}
	}
	private _connectionChanged() {
		this.emit('connectionChanged', this.getStatus())
	}
}
