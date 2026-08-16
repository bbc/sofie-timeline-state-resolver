export * from 'atem-connection'
import * as OrigAtemConnection from 'atem-connection'
import { EventEmitter } from 'events'

const setTimeoutOrg = setTimeout

// @ts-ignore separate declarations
export class BasicAtem extends EventEmitter implements OrigAtemConnection.BasicAtem {
	private _status = OrigAtemConnection.AtemConnectionStatus.CLOSED

	constructor(_options?: OrigAtemConnection.AtemOptions) {
		super()

		// keep the mocked status in sync with tests that emit the events directly
		this.on('connected', () => (this._status = OrigAtemConnection.AtemConnectionStatus.CONNECTED))
		this.on('disconnected', () => (this._status = OrigAtemConnection.AtemConnectionStatus.CLOSED))
	}
	get status(): OrigAtemConnection.AtemConnectionStatus {
		return this._status
	}
	get state(): OrigAtemConnection.AtemState {
		return OrigAtemConnection.AtemStateUtil.Create()
	}
	async connect(): Promise<void> {
		setTimeoutOrg(() => {
			this.emit('connected')
		}, 10)

		return new Promise<void>((resolve) => {
			setTimeoutOrg(() => {
				resolve()
			}, 5)
		})
	}
	async disconnect(): Promise<void> {
		this._status = OrigAtemConnection.AtemConnectionStatus.CLOSED
		return new Promise<void>((resolve) => {
			setTimeoutOrg(() => {
				resolve()
			}, 10)
		})
	}

	async destroy(): Promise<void> {
		return new Promise<void>((resolve) => {
			setTimeoutOrg(() => {
				resolve()
			}, 10)
		})
	}

	async sendCommand(): Promise<void> {
		return Promise.resolve()
	}
}
