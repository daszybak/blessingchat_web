// Inspiration from https://github.com/robtaussig/react-use-websocket/blob/master/src/lib/use-websocket.ts#L59

import { useEffect, useRef } from "react";
import { Options } from "./types";

const DEFAULT_OPTIONS: Options = {
    connectOnLoad: true
}

// TODO add reconnect, heartbeat functionalities
const useWebsocket = (url: string, options: Options = DEFAULT_OPTIONS) => {
    const websocketRef = useRef<WebSocket | null>(null);

    const initializeWebsocket = () => {
        // If the websocket is already initialized, don't reinitalize
        if (websocketRef.current) return;
        websocketRef.current = new WebSocket(url);
        websocketRef.current.addEventListener("close", (e: CloseEvent) => {
            options.onClose?.(e);
            websocketRef.current = null;
        })
        websocketRef.current.addEventListener("error", (e: Event) => options.onError?.(e))
        websocketRef.current.addEventListener("message", (msg: MessageEvent) => options.onMessage?.(msg))
        websocketRef.current.addEventListener("open", (e: Event) => { options.onOpen?.(e) })
    }

    // Initialize websocket component `onload`
    useEffect(() => {
        if (options.connectOnLoad) {
            initializeWebsocket()
        }

        return () => {
            // Close webhook when the component that instantiated
            // the websocket unmounts
            websocketRef.current?.close();
        }
    }, [])

    return {
        websocket: websocketRef.current,
        openWebsocketConnection: initializeWebsocket,
    }
}

export default useWebsocket;
