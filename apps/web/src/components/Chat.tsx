"use client"
import { useState } from "react"

interface Message {
    message: string;
    id: string;
}

const Chat = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [currMessage, setCurrMessage] = useState<string>("");
    const [prompt, setPrompt] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        const _currMessage = currMessage.slice();
        setMessages((messages) => {
            console.log("old messages", messages, "##", _currMessage);
            return [...messages, { message: _currMessage, id: Date.now().toString() }]
        });
        setCurrMessage("");
        e.preventDefault();
        setIsLoading(true);
        const response = await fetch("http://localhost:4000/chat_bot?prompt=" + prompt, {
            method: "GET",
        });
        const reader = response.body!.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let lines = buffer.split('\n');

            buffer = lines.pop()!;

            for (let line of lines) {
                if (line.startsWith('data: ')) {
                    let dataStr = line.slice(6).trim();

                    if (dataStr === '[DONE]') {
                        break;
                    }

                    if (dataStr) {
                        try {
                            let parsedData = JSON.parse(dataStr);
                            let content = parsedData.content;
                            if (content) {
                                setCurrMessage((prevMessage) => {
                                    return prevMessage + content;
                                });
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            }
        }

        setIsLoading(false);
    };

    return (
        <>
            <div>
                <h1>Chat</h1>
                {messages.map((message, index) => {
                    if (index == messages.length) {
                        return;
                    }
                    return (
                        <div key={message.id}>
                            <div>{message.message}</div>
                            <hr />
                        </div>
                    )
                })}
                <div>{currMessage}</div>
            </div>
            <form onSubmit={handleSubmit}>
                <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                <button type="submit" disabled={isLoading}>Send</button>
            </form>
        </>
    )
}

export default Chat
