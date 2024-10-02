"use client";

import { useEffect, useRef, useState } from "react";

const useWebsocket = () => {
    const websocketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const websocket = new WebSocket("ws://localhost:4000/v1/speech_to_speech");
        websocketRef.current = websocket;

        websocket.onopen = () => {
            console.log("WebSocket connection opened");
        };

        websocket.onclose = () => {
            console.log("WebSocket connection closed");
        };

        websocket.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

        return () => {
            websocket.close();
        };
    }, []);

    return websocketRef.current;
};

const VoiceChat = () => {
    const websocket = useWebsocket();
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!websocket) return;

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "audio") {
                const audioBlob = base64ToBlob(data.audio, "audio/wav");
                const audioUrl = URL.createObjectURL(audioBlob);

                const audio = new Audio(audioUrl);
                audio.play();
            }
        };
    }, [websocket]);

    const startRecording = async () => {
        if (!navigator.mediaDevices) {
            console.error("MediaDevices API not supported");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            setMediaRecorder(recorder);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64Audio = reader.result?.toString().split(",")[1];
                        if (base64Audio) {
                            websocket?.send(
                                JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: base64Audio,
                                })
                            );
                        }
                    };
                    reader.readAsDataURL(event.data);
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
            <button onClick={isRecording ? stopRecording : startRecording}>
                {isRecording ? "Stop Recording" : "Start Recording"}
            </button>
            <audio ref={audioRef} controls hidden />
        </div>
    );
};

function base64ToBlob(base64: string, mimeType: string) {
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (
        let offset = 0;
        offset < byteCharacters.length;
        offset += 512
    ) {
        const slice = byteCharacters.slice(offset, offset + 512);

        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });
}

export default VoiceChat;
