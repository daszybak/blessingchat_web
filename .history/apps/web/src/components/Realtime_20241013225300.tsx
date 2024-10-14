"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebsocket, WavRecorder, WavStreamPlayer, RealtimeClient } from "shared_frontend";

const Realtime = () => {
    const [messages, setMessages] = useState<[]>([]);
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [canPushToTalk, setCanPushToTalk] = useState<boolean>(true);
    const [isRecording, setIsRecording] = useState<boolean>(false);
    // WavRecorder (speech input)
    const wavRecorderRef = useRef<WavRecorder>(
        new WavRecorder({ sampleRate: 24000 })
    )
    // WavStreamPlayer (speech output)
    const wavStreamPlayerRef = useRef<WavStreamPlayer>(
        new WavStreamPlayer({ sampleRate: 24000 })
    )

    /*
    ** Webhook setup
    */
    const { openWebsocketConnection } = useWebsocket("http://localhost:4000/v1/speech_to_speech", false, {}, true)
    const realtimeClientRef = useRef(new RealtimeClient(openWebsocketConnection, true));

    /**
     * References for
     * - Rendering audio visualization (canvas)
     * - Autoscrolling event logs
     * - Timing delta for event log displays
     */
    const clientCanvasRef = useRef<HTMLCanvasElement>(null);
    const serverCanvasRef = useRef<HTMLCanvasElement>(null);
    const eventsScrollHeightRef = useRef(0);
    const eventsScrollRef = useRef<HTMLDivElement>(null);
    const startTimeRef = useRef<string>(new Date().toISOString());

    const connect = useCallback(async () => {
        startTimeRef.current = new Date().toISOString();
        setIsConnected(true);
        setMessages([]);

        await wavRecorderRef.current.begin();
        await wavStreamPlayerRef.current.connect();
        await realtimeClientRef.current.connect();
    }, [])

    const disconnect = useCallback(async () => {
        setIsConnected(false);
        setMessages([]);
        websocket?.close();
        wavRecorderRef.current.end();
        wavStreamPlayerRef.current.interrupt();
    }, []);


    const startRecording = async () => {
        setIsRecording(true);
        const client = realtimeClientRef.current;
        const wavRecorder = wavRecorderRef.current;
        const wavStreamPlayer = wavStreamPlayerRef.current;
        const trackSampleOffset = await wavStreamPlayer.interrupt();
        if (trackSampleOffset?.trackId) {
            const { trackId, offset } = trackSampleOffset;
            client.cancelResponse(trackId, offset);
        }
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    };

    /**
     * In push-to-talk mode, stop recording
     */
    const stopRecording = async () => {
        setIsRecording(false);
        const client = realtimeClientRef.current;
        const wavRecorder = wavRecorderRef.current;
        await wavRecorder.pause();
        client.createResponse();
    };

    return (
        <div>
            <h1>Voice Chat</h1>
            <button onClick={isConnected ? disconnect : connect}>
                {isConnected ? "disconnect" : "connect"}
            </button>
            {isConnected && canPushToTalk && (
                <button
                    disabled={!isConnected || !canPushToTalk}
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                >
                    {isRecording ? 'release to send' : 'push to talk'}
                </button>
            )}
        </div>
    );
};

export default Realtime;
