"use client"
import { useState } from "react"
import { ReloadIcon } from "@radix-ui/react-icons";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

interface Item {
    message: string;
    id: string;
    prompt: string;
}

const Item: React.FC<Item> = ({ prompt, message }) => {
    return (
        <div className="flex flex-col">
            <div className="self-end flex-1 bg-sidebar-accent p-2 rounded-md mb-1">{prompt}</div>
            <div className="self-start flex-1">{message}</div>
        </div>
    )
}

const Chat = () => {
    const [prevItems, setPrevItems] = useState<Item[]>([]);
    const [currItem, setCurrItem] = useState<Item>();
    const [prompt, setPrompt] = useState<string>("");
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        if (currItem) {
            console.log("why here?")
            setPrevItems((prevItem) => [
                ...prevItem, currItem
            ])
            setCurrItem(undefined);
        }
        setCurrItem(currItem => ({
            ...(currItem ? currItem : {
                message: "",
                id: new Date().toISOString()
            }),
            prompt
        }))
        e.preventDefault();
        setIsLoading(true);
        setPrompt("");
        const response = await fetch("http://localhost:4000/v1/chat_bot?prompt=" + prompt, {
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
                                setCurrItem(item => ({
                                    ...item!,
                                    message: item!.message + content
                                }))
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
        <div className="flex flex-col h-full">
            <div className="overflow-hidden flex-1 pb-4">
                <div className="h-full">
                    <div className="relative h-full ">
                        <div className="h-full overflow-y-auto px-4 w-full">
                            <div className="flex flex-col">
                                {prevItems.map((item) => {
                                    return (
                                        <div key={item.id}>
                                            <Item {...item} />
                                        </div>
                                    )
                                })}
                                {currItem &&
                                    <Item {...currItem} />
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <form className="w-full" onSubmit={handleSubmit}>
                <Textarea value={prompt} className="mb-2" placeholder="Type your message here" onChange={(e) => setPrompt(e.target.value)} />
                <Button className="w-full mb-8" type="submit" disabled={isLoading}>
                    {isLoading ?
                        <ReloadIcon className="mr-2 h-4 w-4 animate-spin" /> :
                        "Send"
                    }
                </Button>
            </form>
        </div>
    )
}

export default Chat
