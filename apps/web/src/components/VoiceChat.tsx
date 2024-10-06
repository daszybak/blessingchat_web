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

const VoiceChat = () => {
    const [state, dispatchEvent] = useReducer(websocketReducer, initialState);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement>(null);

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

        // Initialize AudioContext once
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({
                sampleRate
            })
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
                    // Step 1: Decode Base64 to ArrayBuffer
                    const pcmArrayBuffer = Realtime.base64ToArrayBuffer(data.delta);

                    // Step 2: Convert PCM16 to Float32Array
                    const float32Array = Realtime.pcmArrayBufferToFloat32(pcmArrayBuffer);

                    const audioBuffer = audioContext.createBuffer(channels, float32Array.length, sampleRate);
                    audioBuffer.getChannelData(0).set(float32Array);

                    queueRef.current.push(audioBuffer);

                    // Step 6: Start playback if not already playing
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

    // TODO fix sending message
    const startRecording = async () => {
        if (!navigator.mediaDevices) {
            console.error("MediaDevices API not supported");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            setMediaRecorder(recorder);

            recorder.ondataavailable = async (event) => {
                try {
                    if (event.data && event.data.size > 0) {
                        const arrayBuffer = await event.data.arrayBuffer();
                        const audioBuffer = await audioContextRef.current?.decodeAudioData(arrayBuffer);
                        const pcmData = audioBuffer?.getChannelData(0);
                        const pcm16Data = RealtimeUtils.floatTo16BitPCM(pcmData ?? new Float32Array());
                        const base64Data = RealtimeUtils.arrayBufferToBase64(pcm16Data);
                        const message = JSON.stringify({
                            type: "input_audio_buffer.append",
                            audio: base64Data,
                        })
                        websocket?.send(message);
                    }
                } catch (error) {
                    console.log("err: ", error);
                }
            };

            recorder.onstart = () => {
                setAudioChunks([]);
                console.log("Recording started");
            };

            recorder.onstop = () => {
                console.log("Recording stopped");
                websocket?.send(
                    JSON.stringify({ type: "input_audio_buffer.commit" })
                );
                websocket?.send(JSON.stringify({ type: "response.create" }));
            };

            recorder.start(500);
            setIsRecording(true);
        } catch (error) {
            console.error("Error accessing microphone:", error);
        }
    };

    const stopRecording = () => {
        mediaRecorder?.stop();
        setIsRecording(false);
    };

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
