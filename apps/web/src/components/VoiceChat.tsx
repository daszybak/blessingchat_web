"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Realtime from "@/src/utils/realtime";
import RealtimeUtils from "@/src/utils/realtime";

interface WebsocketReducerState {
    websocket: WebSocket | null;
    isConnected: boolean,
    error: any
}

const initialState: WebsocketReducerState = {
    websocket: null,
    isConnected: false,
    error: null
}

type Actions = { type: "open"; payload: WebSocket | null } | { type: "close" } | { type: "error"; payload: any }

const websocketReducer = (state: WebsocketReducerState, action: Actions) => {
    switch (action.type) {
        case "open":
            return {
                ...state,
                websocket: action.payload,
                isConnected: true,
            }
        case "close":
            return {
                ...state,
                isConnected: false,
            }
        case "error":
            return {
                ...state,
                error: action.payload
            }
    }
}

// TODO refactor
// TODO add bidirectional communication
const VoiceChat = () => {
    const [state, dispatchEvent] = useReducer(websocketReducer, initialState);
    const [isRecording, setIsRecording] = useState(false);
    const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const { websocket, isConnected, error } = state;

    useEffect(() => {
        const _websocket = new WebSocket("http://localhost:4000/v1/speech_to_speech");
        _websocket.addEventListener("open", function () {
            console.log("Connection with:", this.url, " opened")
        })
        _websocket.addEventListener("close", function () {
            console.log("Connection with:", this.url, " closed")
            dispatchEvent({ type: "close" });
        })
        _websocket.addEventListener("error", function (e) {
            dispatchEvent({ type: "error", payload: e })
        })
        dispatchEvent({ type: "open", payload: _websocket })
    }, []);

    const audioContextRef = useRef<AudioContext | null>(null);
    const queueRef = useRef<AudioBuffer[]>([]);
    const isPlayingRef = useRef(false);
    const nextPlayTimeRef = useRef(0);

    const sampleRate = 24000; // PCM16 sample rate
    const channels = 1; // Mono

    useEffect(() => {
        if (!websocket) return;

        // Create audio context, which is used to process the 
        // audio. It is a graph data structure consisting of
        // input node, ouput node, processing nodes
        // 
        // It is necessary to create the input/source with
        // the destination node ("often your speakers")
        // or, e.g., you can take the `destination.stream`
        // and pass it further to change the "destination"/output
        //
        // It takes the stream, i.e., microphone, or buffer,
        // i.e., incoming websocket message, and processes it,
        // 
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({
                sampleRate
            });
        } else if (audioContextRef.current.state === "suspended") {
            audioContextRef.current.resume();
        }

        const audioContext = audioContextRef.current;

        async function playQueue(audioContext: AudioContext) {
            while (queueRef.current.length > 0) {
                const buffer = queueRef.current.shift();
                const source = audioContext.createBufferSource();
                source.buffer = buffer as AudioBuffer | null;
                source.connect(audioContext.destination);
                source.start();

                // Wait until the buffer finishes playing
                await new Promise((resolve) => {
                    source.onended = resolve;
                });
            }
            isPlayingRef.current = false;
        }

        websocket.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            console.log("Received data: ", data);

            if (data.type === "response.audio.delta") {
                try {
                    const pcmArrayBuffer = Realtime.base64ToArrayBuffer(data.delta);

                    const float32Array = Realtime.pcmArrayBufferToFloat32(pcmArrayBuffer);

                    const audioBuffer = audioContext.createBuffer(channels, float32Array.length, sampleRate);
                    audioBuffer.getChannelData(0).set(float32Array);

                    queueRef.current.push(audioBuffer);

                    if (!isPlayingRef.current) {
                        isPlayingRef.current = true;
                        playQueue(audioContext);
                    }
                } catch (error) {
                    console.error("Error processing audio data:", error);
                }
            }
        };

        // Cleanup on unmount
        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, [websocket]);

    const startRecording = async () => {
        if (!navigator.mediaDevices) {
            console.error("MediaDevices API not supported");
            return;
        }
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({
                sampleRate
            });
        } else if (audioContextRef.current.state === "suspended") {
            audioContextRef.current.resume();
        }
        const audioContext = audioContextRef.current;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = audioContext.createMediaStreamSource(stream);

            // Define and add the AudioWorkletProcessor
            // const pcm16ProcessorCode = `
            //     class PCM16Processor extends AudioWorkletProcessor {
            //         constructor() {
            //             super();
            //         }

            //         process(inputs, outputs, parameters) {
            //             const input = inputs[0];
            //             if (input.length > 0) {
            //                 this.port.postMessage(input[0]);
            //             }
            //             return true;
            //         }
            //     }

            //     registerProcessor('pcm16-processor', PCM16Processor);
            // `;
            // const blob = new Blob([pcm16ProcessorCode], { type: 'application/javascript' });
            // const blobURL = URL.createObjectURL(blob);
            // await audioContext.audioWorklet.addModule(blobURL);
            // URL.revokeObjectURL(blobURL);

            // // Create and connect the AudioWorkletNode
            // const processingNode = new AudioWorkletNode(audioContext, 'pcm16-processor');
            // source.connect(processingNode);

            // // Handle messages from the processor if needed
            // processingNode.port.onmessage = (event) => {
            //     const floatData = event.data;
            //     // Perform real-time visualization or other processing here
            //     // visualizeAudioData(floatData);

            //     // NOTE possible to visualize for the user the "waves"
            //     // that shows the music "waves"
            // };

            // // Create MediaStreamDestination and connect the processing node
            // const destination = audioContext.createMediaStreamDestination();
            // processingNode.connect(destination);

            // Initialize MediaRecorder
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);
            const mediaRecorder = new MediaRecorder(destination.stream);
            mediaRecorderRef.current = mediaRecorder;

            // Handle data availability
            mediaRecorder.ondataavailable = async (event) => {
                // console.log("data avaiable", event);
                // console.log("audio context state", audioContext)
                try {
                    if (event.data && event.data.size > 0) {
                        const arrayBuffer = await event.data.arrayBuffer();
                        console.log("arraybuffer", arrayBuffer, arrayBuffer.byteLength);
                        if (arrayBuffer.byteLength < 1) {
                            console.log("Nothing was recorded");
                            return;
                        }
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        const pcmData = audioBuffer.getChannelData(0);
                        const pcm16Data = RealtimeUtils.floatTo16BitPCM(pcmData);
                        const base64Data = RealtimeUtils.arrayBufferToBase64(pcm16Data);
                        const message = JSON.stringify({
                            type: "input_audio_buffer.append",
                            audio: base64Data,
                        });
                        websocket?.send(message);
                    }
                } catch (error) {
                    console.error("Error processing audio data:", error);
                }
            };

            // Handle recorder start
            mediaRecorder.onstart = () => {
                setAudioChunks([]);
                console.log("Recording started");
            };

            // Handle recorder stop
            mediaRecorder.onstop = () => {
                console.log("Recording stopped");
                websocket?.send(
                    JSON.stringify({ type: "input_audio_buffer.commit" })
                );
                websocket?.send(JSON.stringify({ type: "response.create" }));
            };


            // Start recording 
            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error("Error accessing microphone or setting up recorder:", error);
        }
    };


    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };

    // NOTE be careful in dev mode to start the audioContextRef.current.resume()
    // as `useEffect` triggers twice :)
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);


    return (
        <div>
            <h1>Voice Chat</h1>
            <button onClick={isRecording ? stopRecording : startRecording}>
                {isRecording ? "Stop Recording" : "Start Recording"}
            </button>
            <audio ref={audioRef} controls hidden />
        </div>
    );
};

export default VoiceChat;
