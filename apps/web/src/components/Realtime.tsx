"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebsocket, WavRecorder, WavStreamPlayer, RealtimeClient, ItemType } from "shared_frontend";
import { Button } from "./ui/button";

const Item: React.FC<ItemType> = ({ role, formatted: { transcript } }) => {
    if (role === "user") {
        return (
            <div className="flex flex-col">
                <div className="self-end flex-1 bg-sidebar-accent p-2 rounded-md mb-1">{transcript}</div>
            </div>
        );
    } else if (role === "assistant") {
        return (
            <div className="flex flex-col">
                <div className="self-start flex-1">{transcript}</div>
            </div>
        );
    } else if (role === "system") {

    }
}

const Realtime = () => {
    const [items, setItems] = useState<ItemType[]>([]);
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
    const { openWebsocketConnection } = useWebsocket("http://localhost:4000/v1/speech_to_speech", {}, false)
    const realtimeClientRef = useRef(new RealtimeClient(openWebsocketConnection, true));

    useEffect(() => {
        const rc = realtimeClientRef.current;
        const handleConversationUpdated = async ({ item, delta }: any) => {
            const items = rc.realtimeConversation.getItems();
            if (delta?.audio) {
                wavStreamPlayerRef.current.add16BitPCM(delta.audio, item.id);
            }
            if (item.status === 'completed' && item.formatted.audio?.length) {
                const wavFile = await WavRecorder.decode(
                    item.formatted.audio,
                    24000,
                    24000
                );
                item.formatted.file = wavFile;
            }
            setItems(items);
        }
        rc.on('conversation.updated', handleConversationUpdated);

        return () => {
            rc.off('conversation.updated', handleConversationUpdated);
        }
    }, [])

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
        setItems([]);

        await wavRecorderRef.current.begin();
        await wavStreamPlayerRef.current.connect();
        await realtimeClientRef.current.connect();
    }, [])

    const disconnect = useCallback(async () => {
        setIsConnected(false);
        setItems([]);
        wavRecorderRef.current.end();
        wavStreamPlayerRef.current.interrupt();
        realtimeClientRef.current.disconnect();
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
        <div className="flex flex-col h-full">
            <div className="overflow-hidden flex-1 pb-4">
                <div className="h-full">
                    <div className="relative h-full ">
                        <div className="h-full overflow-y-auto px-4 w-full">
                            <div className="flex flex-col">
                                {items.map((item) => {
                                    return (
                                        <div key={item.id}>
                                            <Item {...item} />
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="w-full">

                <Button variant="outline" onClick={isConnected ? disconnect : connect}>
                    {isConnected ? "disconnect" : "connect"}
                </Button>
                {isConnected && canPushToTalk && (
                    <Button
                        disabled={!isConnected || !canPushToTalk}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                    >
                        {isRecording ? 'release to send' : 'push to talk'}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default Realtime;
