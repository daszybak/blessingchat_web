import { useEffect, useRef } from "react";
import { Options } from "../../../packages/websocket/types";
import { WebSocketClient } from "../../../packages/websocket/client";

const DEFAULT_OPTIONS: Options = {
    debug: false
}

const useWebsocket = (url: string, options: Options = DEFAULT_OPTIONS, debug: boolean = false) => {
    const websocketRef = useRef<WebSocket | null>(null);

    const openWebsocketConnection = async () => {
        // If the websocket is already initialized, don't reinitalize
        if (websocketRef.current) return;
        websocketRef.current = await (new WebSocketClient(url, options, debug)).getWebSocket();
        return websocketRef.current;
    }

    useEffect(() => {
        return () => {
            // Close webhook when the component that instantiated
            // the websocket unmounts
            websocketRef.current?.close();
        }
    }, [])


    return {
        openWebsocketConnection,
    }
}

export default useWebsocket;
