import { DeviceStatus, StatusCode } from './../../devices/device'
import { Device, DeviceContextAPI } from '../../service/device'

import { VMixCommandSender, VMixConnection } from './connection'
import {
	VMixOptions,
	ActionExecutionResult,
	VmixActions,
	Mappings,
	TSRTimelineContent,
	Timeline,
} from 'timeline-state-resolver-types'
import { VMixState, VMixStateDiffer, VMixStateExtended } from './vMixStateDiffer'
import { VMixStateCommandWithContext } from './vMixCommands'
import { MappingsVmix, VMixTimelineStateConverter } from './vMixTimelineStateConverter'
import { VMixXmlStateParser } from './vMixXmlStateParser'
import { VMixPollingTimer } from './vMixPollingTimer'
import { VMixStateSynchronizer } from './vMixStateSynchronizer'
import { Response } from './vMixResponseStreamReader'
import { vMixActionsImpl } from './vMixActionsImpl'

/**
 * Default time, in milliseconds, for when we should poll vMix to query its actual state.
 */
const DEFAULT_VMIX_POLL_INTERVAL = 10 * 1000

/**
 * How long to wait, in milliseconds, to poll vMix's state after we send commands to it.
 */
const BACKOFF_VMIX_POLL_INTERVAL = 5 * 1000

export type EnforceableVMixInputStateKeys = 'duration' | 'loop' | 'transform' | 'layers' | 'listFilePaths'

/**
 * This is a VMixDevice, it sends commands when it feels like it
 */
export class VMixDevice extends Device<VMixOptions, VMixStateExtended, VMixStateCommandWithContext> {
	/** Setup in init */
	private _vMixConnection!: VMixConnection
	private _vMixCommandSender!: VMixCommandSender

	private _connected = false
	private _initialized = false
	private _stateDiffer: VMixStateDiffer
	private _timelineStateConverter: VMixTimelineStateConverter
	private _xmlStateParser: VMixXmlStateParser
	private _stateSynchronizer: VMixStateSynchronizer
	private _expectingStateAfterConnecting = false
	private _expectingPolledState = false
	private _pollingTimer: VMixPollingTimer | null = null
	private _debugXml = false
	private logger: DeviceContextAPI<VMixStateExtended>['logger']

	constructor(context: DeviceContextAPI<VMixStateExtended>) {
		super(context)
		this.logger = this.context.logger // just for convenience

		this._stateDiffer = new VMixStateDiffer(() => this.context.getCurrentTime(), this._sendCommands)

		this._timelineStateConverter = new VMixTimelineStateConverter(this._stateDiffer)

		this._xmlStateParser = new VMixXmlStateParser()
		this._stateSynchronizer = new VMixStateSynchronizer()
	}

	async init(options: VMixOptions): Promise<boolean> {
		this._debugXml = !!options.debugXml
		this._vMixConnection = new VMixConnection(options.host, options.port, false)
		this._vMixCommandSender = new VMixCommandSender(this._vMixConnection)
		this._vMixConnection.on('connected', () => {
			// We are not resetting the state at this point and waiting for the state to arrive. Otherwise, we risk
			// going back and forth on reconnections
			this._setConnected(true)
			this._expectingStateAfterConnecting = true
			this.logger.debug('connected')
			this._pollingTimer?.start()
			this._requestVMixState('VMix init')
		})
		this._vMixConnection.on('disconnected', () => {
			this._setConnected(false)
			this._pollingTimer?.stop()
			this.logger.debug('disconnected')
		})
		this._vMixConnection.on('error', (e) => this.logger.error('VMix connection error', e))
		this._vMixConnection.on('data', (data) => this._onDataReceived(data))
		// this._vmix.on('debug', (...args) => this.emitDebug(...args))

		this._vMixConnection.connect()

		const pollTime =
			typeof options.pollInterval === 'number' && options.pollInterval >= 0 // options.pollInterval === 0 disables the polling
				? options.pollInterval
				: DEFAULT_VMIX_POLL_INTERVAL

		if (pollTime) {
			this._pollingTimer = new VMixPollingTimer(pollTime)
			this._pollingTimer.on('tick', () => {
				this._expectingPolledState = true
				this._requestVMixState('VMix poll')
			})
		}

		return true
	}

	get connected(): boolean {
		return this._connected
	}

	public convertTimelineStateToDeviceState(
		state: Timeline.TimelineState<TSRTimelineContent>,
		newMappings: Mappings
	): VMixStateExtended {
		return this._timelineStateConverter.getVMixStateFromTimelineState(state, newMappings as MappingsVmix)
	}

	public diffStates(
		oldState: VMixStateExtended | undefined,
		newState: VMixStateExtended,
		_mappings: Mappings,
		time: number
	): VMixStateCommandWithContext[] {
		return this._stateDiffer.getCommandsToAchieveState(time, oldState, newState)
	}

	public async sendCommand(command: VMixStateCommandWithContext): Promise<void> {
		// Do not poll or retry while we are sending commands, instead always do it closely after.
		// This is potentially an issue while producing a show, because it is theoretically possible
		// that the operator keeps performing actions/takes within 5 seconds of one another and
		// therefore this timeout keeps getting reset and never expires.
		// For now, we classify this as an extreme outlier edge case and acknowledge that this system
		// does not support it.
		this._expectingPolledState = false
		this._pollingTimer?.postponeNextTick(BACKOFF_VMIX_POLL_INTERVAL)

		this.logger.debug(command)

		return this._vMixCommandSender.sendCommand(command.command)
	}

	private _sendCommands = (commands: VMixStateCommandWithContext[]): void => {
		const ps = commands.map(async (command) => this.sendCommand(command))
		Promise.all(ps).catch((e) => this.logger.error('', e))
	}

	private _onDataReceived(data: Response): void {
		if (data.message !== 'Completed' && (data.command !== 'XML' || this._debugXml)) {
			this.logger.debug(data)
		}
		if (data.command === 'XML' && data.body) {
			if (!this._initialized) {
				this._initialized = true
				this._connectionChanged()
			}
			const realState = this._xmlStateParser.parseVMixState(data.body)
			if (this._expectingStateAfterConnecting) {
				this._setFullState(realState)
				this._expectingStateAfterConnecting = false
			} else if (this._expectingPolledState) {
				this._setPartialInputState(realState)
				this._expectingPolledState = false
			}
		}
	}

	private _connectionChanged() {
		this.context.connectionChanged(this.getStatus())
	}

	private _setConnected(connected: boolean) {
		if (this._connected !== connected) {
			this._connected = connected
			this._connectionChanged()
		}
	}

	/**
	 * Updates the entire state when we (re)connect
	 * @param realState State as reported by vMix itself.
	 */
	private _setFullState(realState: VMixState) {
		const fullState: VMixStateExtended = this._stateDiffer.getDefaultState(realState)
		this.context.resetToState(fullState).catch((e) => this.context.logger.error('Failed to reset to full state', e))
	}

	/**
	 * Runs when we receive XML state from vMix,
	 * generally as the result a poll (if polling/enforcement is enabled).
	 * @param realState State as reported by vMix itself.
	 */
	private _setPartialInputState(realState: VMixState) {
		const expectedState = this.context.getCurrentState() // what state handler believes is the state now
		if (expectedState === undefined) {
			this.logger.debug('Could not get current state')
			return // we need full state to apply anything
		}
		const currentState = this._stateSynchronizer.applyRealState(expectedState, realState) // what state we should aim to get to

		this.context
			.resetToState(currentState) // TODO: this could probably use updateStateFromDeviceState in order to be less taxing
			.catch((e) => this.context.logger.error('Failed to reset to partially updated state', e))
	}

	async terminate() {
		this._vMixConnection.removeAllListeners()
		this._vMixConnection.disconnect()
		this._pollingTimer?.stop()
	}

	getStatus(): Omit<DeviceStatus, 'active'> {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (!this._connected) {
			statusCode = StatusCode.BAD
			messages.push('Not connected')
		} else if (!this._initialized) {
			statusCode = StatusCode.BAD
			messages.push('Not initialized')
		}

		return {
			statusCode: statusCode,
			messages: messages,
		}
	}

	public readonly actions: {
		[id in VmixActions]: (payload?: any) => Promise<ActionExecutionResult>
	} = new vMixActionsImpl(() => this._vMixCommandSender)

	/**
	 * Request vMix's XML status.
	 */
	private _requestVMixState(context: string) {
		this._vMixConnection.requestVMixState().catch((e) => this.logger.error(context, e))
	}
}
