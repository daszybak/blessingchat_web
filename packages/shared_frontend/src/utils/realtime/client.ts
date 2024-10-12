/**
 * RealtimeClient
 * @class
 */

import { RealtimeEventHandler } from "./event_handler"
import RealtimeUtils from "./utils";

export class RealtimeClient extends RealtimeEventHandler {
    private _websocket: WebSocket;
    private _debug: boolean;
    /**
     * Create RealtimeClient instance
     * @param({ws: WebSocket})
    */
    constructor(websocket: WebSocket, debug: boolean = false) {
        super();
        if (!(websocket instanceof WebSocket)) {
            throw new Error("Cannot initialize the Realtime Client without providing a websocket");
        }
        this._debug = debug;
        this._websocket = websocket;
        this._addAPIEventHandlers(this._websocket);
    }

    private _addAPIEventHandlers(websocket: WebSocket) {
        websocket.addEventListener("message", (msg: MessageEvent) => {
            try {
                const message = JSON.parse(msg.data);
            } catch (error) {
                // TODO add error if couldn't parse message
            }
        })
    }

    /**
     * Receives event from WebSocket connection
     * @param {string} eventName
     * @param {{[key: string]: any}} event
     */
    receive(eventName: string, event: any) {
        this._log(`received: `, eventName, event);
        this.dispatch(`server.${eventName}`, event);
        this.dispatch(`server.*`, event);
    }

    isConnected() {
        return !!this._websocket;
    }

    /**
     * Sends an event to WebSocket and dispatches as "client.{eventName}" and "client.*" events
     * @param {string} eventName
     * @param {{[key: string]: any}} event
     * @returns {true}
     */
    send(eventName: string, data: any) {
        if (!this.isConnected()) {
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
        this._websocket.send(JSON.stringify(event));
        return true;
    }

    /**
     * 
     * @param {any} args
     * @returns 
     */
    private _log(...args: any) {
        const date = new Date().toISOString();
        const logs = [`[Websocket/${date}]`].concat(args).map((arg) => {
            if (typeof arg === 'object' && arg !== null) {
                return JSON.stringify(arg, null, 2);
            } else {
                return arg;
            }
        });
        if (this._debug) {
            console.log(...logs);
        }
        return true;
    }
}
