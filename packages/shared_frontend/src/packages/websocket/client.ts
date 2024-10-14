import { Logger } from "../logger/logger";
import { Options } from "./types";

const DEFAULT_OPTIONS: Options = {
    debug: false
}

// TODO add reconnect and heartbeat functionalities
// TODO add wait for open connection functionality
/**
 * WebSocket Client
 * @class
 */
export class WebSocketClient {
    private _cachedOptions: Options;
    private _websocket: WebSocket | null;
    private _connectionOpenedDateIsoString: string | undefined;
    private _debug: boolean;
    private _url: string;
    private _logger: Logger;
    constructor(url: string, options: Options = DEFAULT_OPTIONS, debug: boolean = false) {
        this._cachedOptions = structuredClone(options);
        this._websocket = new WebSocket(url);
        this._debug = !!options.debug;
        this._addEventHandlers();
        this._url = url;
        // NOTE it is also possible to inject a logger
        this._logger = new Logger("WebSocket", this._debug);
    }

    private _websocketReadyStates(state: number) {
        switch (state) {
            case WebSocket.OPEN:
                return "open";
            case WebSocket.CLOSED:
                return "closed";
            case WebSocket.CLOSING:
                return "closing";
            case WebSocket.CONNECTING:
                return "connecting";
            default:
                throw new Error("Cannot find WebSocket state");
        }
    }

    async getWebSocket(): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            if (this._websocket === null) {
                reject("Websocket isn't initialized");
            }
            resolve(this._websocket as WebSocket);
        })
    }

    private _event_handlers: { [K in keyof WebSocketEventMap]: (event: WebSocketEventMap[K]) => any } = {
        close: (e: CloseEvent) => {
            this._cachedOptions.onClose?.(e);
            this._websocket?.close();
            this._websocket = null;
            this._log("Disconnected from ", this._url);
        },
        error: (e: Event) => {
            this._cachedOptions.onError?.(e)
            this._websocket?.close();
            this._log("Error, disconnected from " + this._url);
        },
        message: (msg: MessageEvent) => {
            this._cachedOptions.onMessage?.(msg)
            this._log("Received message ", msg);
        },
        open: (e: Event) => {
            this._cachedOptions.onOpen?.(e)
            this._connectionOpenedDateIsoString = new Date().toISOString();
            this._log("Connected to " + this._url);
        },
    }

    isConnected() {
        !!this._websocket;
    }

    getConnectionOpenedDateIsoString() {
        return this._connectionOpenedDateIsoString;
    }

    private _addEventHandlers() {
        for (const eh in this._event_handlers) {
            // @ts-ignore
            this._websocket.addEventListener(eh, this._event_handlers[eh]);
        }
    }

    private _log(...args: any) {
        this._logger.log(...args);
    }
}
