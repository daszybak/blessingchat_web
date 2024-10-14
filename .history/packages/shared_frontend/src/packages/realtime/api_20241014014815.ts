/**
 * RealtimeApi
 * @class
 */

import { Logger } from "../logger/logger";
import { RealtimeEventHandler } from "./event_handler";
import RealtimeUtils from "./utils";

export class RealtimeApi extends RealtimeEventHandler {
    private _websocket: WebSocket | null = null;
    private _debug: boolean;
    private _logger: Logger;
    private _openWebsocketConnection: () => Promise<WebSocket> | WebSocket;

    constructor(openWebsocketConnection: () => Promise<WebSocket> | WebSocket, debug: boolean = false) {
        super();
        this._debug = debug;
        this._logger = new Logger("RealtimeApi", this._debug);
        this._openWebsocketConnection = openWebsocketConnection;
    }

    private _log(...args: any) {
        this._logger.log(...args);
    }

    private _addOnMessageEventListener() {
        if (!this._websocket) return;
        this._websocket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            const eventName = message.type;
            const _event = message;
            this._log(`received: `, eventName, _event);
            this.dispatch(`server.${eventName}`, _event);
            this.dispatch(`server.*`, _event);
        });
    }

    isConnected() {
        return !!this._websocket;
    }

    /**
     * Disconnects from Realtime API server
     */
    disconnect(ws?: WebSocket): boolean {
        if (!ws || this._websocket === ws) {
            this._websocket && this._websocket.close();
            return true;
        }
        return false;
    }


    /**
     * Connects to the Realtime API server
     */
    async connect() {
        this._websocket = await this._openWebsocketConnection();
        this._addOnMessageEventListener();
    }

    /**
     * Sends event to WebSocket
     */
    send(eventName: string, data?: any): boolean {
        if (!this.isConnected()) {
            this._log(this._websocket);
            throw new Error(`RealtimeAPI is not connected`);
        }
        data = data || {};
        if (typeof data !== 'object') {
            throw new Error(`data must be an object`);
        }
        const event = {
            event_id: RealtimeUtils.generateId('evt_'),
            type: eventName,
            ...data,
        };
        this.dispatch(`client.${eventName}`, event);
        this.dispatch('client.*', event);
        this._log(`sent:`, eventName, event);
        // FIXME fix websocket await initialization
        // NOTE we check if the `_websocket` exists when
        // checking if `isConnected()`
        this._websocket!.send(JSON.stringify(event));
        return true;
    }
}
