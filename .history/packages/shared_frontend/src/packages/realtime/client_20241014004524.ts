import { RealtimeApi } from "./api";
import { RealtimeConversation } from "./conversation";
import { RealtimeEventHandler } from "./event_handler";
import { AssistantItemType, InputAudioContentType, InputTextContentType, ItemType, SessionResourceType, ToolDefinitionType } from "./types";
import RealtimeUtils from "./utils";

type SessionConfig = Pick<SessionResourceType, "turn_detection" | "tools" | "temperature" | "voice">;

const DEFAULT_SESSION_CONFIG: SessionConfig = {
    turn_detection: null,
    temperature: 0.8,
    tools: []
}

/**
 * RealtimeClient
 * @class
 */
export class RealtimeClient extends RealtimeEventHandler {
    private _realtimeApi: RealtimeApi;
    realtimeConversation: RealtimeConversation;
    private _debug: boolean;
    private _sessionCreated: boolean = false;
    private _tools: Record<string, any> = {};
    private _inputAudioBuffer: Int16Array = new Int16Array(0);
    private _sessionConfig: SessionConfig;

    constructor(openWebsocketConnection: () => Promise<WebSocket> | WebSocket, debug: boolean = false) {
        super();
        this._sessionConfig = structuredClone(DEFAULT_SESSION_CONFIG);
        this._realtimeApi = new RealtimeApi(openWebsocketConnection, debug);
        this._debug = debug;
        this.realtimeConversation = new RealtimeConversation();
    }

    isConnected() {
        return !!this._realtimeApi.isConnected();
    }

    /*
    ** Connects to the RealtimeApi and updates session
    */
    async connect() {
        if (this.isConnected()) {
            throw new Error("Cannot connect you have to disconnect first");
        }
        await this._realtimeApi.connect();
        this.updateSession();
    }


    _resetConfig(): boolean {
        this._sessionCreated = false;
        this._tools = {};
        this._sessionConfig = structuredClone(DEFAULT_SESSION_CONFIG);
        this._inputAudioBuffer = new Int16Array(0);
        return true;
    }

    /**
     * Resets the client instance entirely: disconnects and clears active config
     */
    reset() {
        this.disconnect();
        this.clearEventHandlers();
        this._realtimeApi.clearEventHandlers();
        this._resetConfig();
        this._addAPIEventHandlers();
        return true;
    }

    /**
     * Disconnects from the Realtime API and clears the conversation history
     */
    disconnect() {
        this._sessionCreated = false;
        this._realtimeApi.isConnected() && this._realtimeApi.disconnect();
        this.realtimeConversation.clear();
    }

    _addAPIEventHandlers() {
        // Event Logging handlers
        this._realtimeApi.on('client.*', (event) => {
            const realtimeEvent = {
                time: new Date().toISOString(),
                source: 'client',
                event: event,
            };
            this.dispatch('realtime.event', realtimeEvent);
        });
        this._realtimeApi.on('server.*', (event) => {
            const realtimeEvent = {
                time: new Date().toISOString(),
                source: 'server',
                event: event,
            };
            this.dispatch('realtime.event', realtimeEvent);
        });

        // Handles session created event, can optionally wait for it
        this._realtimeApi.on(
            'server.session.created',
            () => (this._sessionCreated = true),
        );

        // Setup for application control flow
        const handler = (event: any, ...args: any) => {
            const { item, delta } = this.realtimeConversation.processEvent(event, ...args);
            return { item, delta };
        };
        const handlerWithDispatch = (event: any, ...args: any) => {
            const { item, delta } = handler(event, ...args);
            if (item) {
                // FIXME: If statement is only here because item.input_audio_transcription.completed
                //        can fire before `item.created`, resulting in empty item.
                //        This happens in VAD mode with empty audio
                this.dispatch('conversation.updated', { item, delta });
            }
            return { item, delta };
        };
        const callTool = async (tool: any) => {
            try {
                const jsonArguments = JSON.parse(tool.arguments);
                const toolConfig = this._tools[tool.name];
                if (!toolConfig) {
                    throw new Error(`Tool "${tool.name}" has not been added`);
                }
                const result = await toolConfig.handler(jsonArguments);
                this._realtimeApi.send('conversation.item.create', {
                    item: {
                        type: 'function_call_output',
                        call_id: tool.call_id,
                        output: JSON.stringify(result),
                    },
                });
            } catch (e) {
                this._realtimeApi.send('conversation.item.create', {
                    item: {
                        type: 'function_call_output',
                        call_id: tool.call_id,
                        // @ts-ignore
                        output: JSON.stringify({ error: e.message }),
                    },
                });
            }
            this.createResponse();
        };

        // Handlers to update internal conversation state
        this._realtimeApi.on('server.response.created', handler);
        this._realtimeApi.on('server.response.output_item.added', handler);
        this._realtimeApi.on('server.response.content_part.added', handler);
        this._realtimeApi.on('server.input_audio_buffer.speech_started', (event) => {
            handler(event);
            this.dispatch('conversation.interrupted');
        });
        this._realtimeApi.on('server.input_audio_buffer.speech_stopped', (event) =>
            handler(event, this._inputAudioBuffer),
        );

        // Handlers to update application state
        this._realtimeApi.on('server.conversation.item.created', (event) => {
            const { item } = handlerWithDispatch(event);
            this.dispatch('conversation.item.appended', { item });
            if (item !== null && "status" in item && item.status === 'completed') {
                this.dispatch('conversation.item.completed', { item });
            }
        });
        this._realtimeApi.on('server.conversation.item.truncated', handlerWithDispatch);
        this._realtimeApi.on('server.conversation.item.deleted', handlerWithDispatch);
        this._realtimeApi.on(
            'server.conversation.item.input_audio_transcription.completed',
            handlerWithDispatch,
        );
        this._realtimeApi.on(
            'server.response.audio_transcript.delta',
            handlerWithDispatch,
        );
        this._realtimeApi.on('server.response.audio.delta', handlerWithDispatch);
        this._realtimeApi.on('server.response.text.delta', handlerWithDispatch);
        this._realtimeApi.on(
            'server.response.function_call_arguments.delta',
            handlerWithDispatch,
        );
        this._realtimeApi.on('server.response.output_item.done', async (event: any) => {
            const { item } = handlerWithDispatch(event);
            if (item !== null && "status" in item && item.status === 'completed') {
                this.dispatch('conversation.item.completed', { item });
            }
            if (item !== null && item.formatted.tool) {
                callTool(item.formatted.tool);
            }
        });

        return true;
    }

    /**
     * Gets the active turn detection mode
     */
    getTurnDetectionType(): Extract<SessionResourceType["turn_detection"], { type: any }>["type"] | null {
        return this._sessionConfig.turn_detection?.type || null;
    }

    /**
     * Add a tool and handler
     */
    addTool(definition: ToolDefinitionType, handler: () => any): {
        definition: ToolDefinitionType;
        handler: () => any
    } {
        if (!definition?.name) {
            throw new Error(`Missing tool name in definition`);
        }
        const name = definition?.name;
        if (this._tools[name]) {
            throw new Error(
                `Tool "${name}" already added. Please use .removeTool("${name}") before trying to add again.`,
            );
        }
        if (typeof handler !== 'function') {
            throw new Error(`Tool "${name}" handler must be a function`);
        }
        this._tools[name] = { definition, handler };
        this.updateSession();
        return this._tools[name];
    }

    /**
     * Removes a tool
     */
    removeTool(name: string): boolean {
        if (!this._tools[name]) {
            throw new Error(`Tool "${name}" does not exist, can not be removed.`);
        }
        delete this._tools[name];
        return true;
    }

    /**
     * Deletes an item
     */
    deleteItem(id: string) {
        this._realtimeApi.send('conversation.item.delete', { item_id: id });
        return true;
    }

    /**
     * Updates session configuration
     * If the client is not yet connected, will save details and instantiate upon connection
     * @param {SessionResourceType} [sessionConfig]
     */
    updateSession({
        modalities = void 0,
        instructions = void 0,
        voice = void 0,
        input_audio_format = void 0,
        output_audio_format = void 0,
        input_audio_transcription = void 0,
        turn_detection = void 0,
        tools = void 0,
        tool_choice = void 0,
        temperature = void 0,
        max_response_output_tokens = void 0,
    }: SessionResourceType = {}) {
        // modalities !== void 0 && (this._sessionConfig.modalities = modalities);
        // instructions !== void 0 && (this._sessionConfig.instructions = instructions);
        voice !== void 0 && (this._sessionConfig.voice = voice);
        // input_audio_format !== void 0 &&
        //     (this._sessionConfig.input_audio_format = input_audio_format);
        // output_audio_format !== void 0 &&
        //     (this._sessionConfig.output_audio_format = output_audio_format);
        // input_audio_transcription !== void 0 &&
        //     (this._sessionConfig.input_audio_transcription =
        //         input_audio_transcription);
        turn_detection !== void 0 &&
            (this._sessionConfig.turn_detection = turn_detection);
        tools !== void 0 && (this._sessionConfig.tools = tools);
        tools ||= [];
        // tool_choice !== void 0 && (this._sessionConfig.tool_choice = tool_choice);
        temperature !== void 0 && (this._sessionConfig.temperature = temperature);
        // max_response_output_tokens !== void 0 &&
        // (this._sessionConfig.max_response_output_tokens =
        // max_response_output_tokens);
        // Load tools from tool definitions + already loaded tools
        let useTools: ToolDefinitionType[] = [];
        useTools = useTools.concat(
            tools.map((toolDefinition) => {
                const definition = {
                    type: 'function' as const,
                    ...toolDefinition,
                };
                if (this._tools[definition?.name]) {
                    throw new Error(
                        `Tool "${definition?.name}" has already been defined`,
                    );
                }
                return definition;
            }),
            Object.keys(this._tools).map((key) => {
                return {
                    type: 'function',
                    ...this._tools[key].definition,
                };
            }),
        );
        const session = { ...this._sessionConfig };
        session.tools = useTools;
        if (this._realtimeApi.isConnected()) {
            this._realtimeApi.send('session.update', { session });
        }
        return true;
    }

    /**
     * Sends user message content and generates a response
     */
    sendUserMessageContent(content: Array<InputTextContentType | InputAudioContentType> = []): boolean {
        if (content.length) {
            for (const c of content) {
                if ('audio' in c && c.audio) {
                    // FIXME parameter types aren't correct, audio is string here but
                    // the type doesn't cover this situation
                    // @ts-ignore
                    if (c.audio instanceof ArrayBuffer || c.audio instanceof Int16Array) {
                        c.audio = RealtimeUtils.arrayBufferToBase64(c.audio);
                    }
                }
            }
            this._realtimeApi.send('conversation.item.create', {
                item: {
                    type: 'message',
                    role: 'user',
                    content,
                },
            });
        }
        this.createResponse();
        return true;
    }

    appendInputAudio(arrayBuffer: Int16Array | ArrayBuffer): boolean {
        if (arrayBuffer.byteLength > 0) {
            this._realtimeApi.send('input_audio_buffer.append', {
                audio: RealtimeUtils.arrayBufferToBase64(arrayBuffer),
            });
            this._inputAudioBuffer = RealtimeUtils.mergeInt16Arrays(
                this._inputAudioBuffer,
                arrayBuffer,
            );
        }
        return true;
    }

    createResponse(): boolean {
        if (
            this.getTurnDetectionType() === null &&
            this._inputAudioBuffer.byteLength > 0
        ) {
            this._realtimeApi.send('input_audio_buffer.commit');
            this.realtimeConversation.queueInputAudio(this._inputAudioBuffer);
            this._inputAudioBuffer = new Int16Array(0);
        }
        this._realtimeApi.send('response.create');
        return true;
    }

    cancelResponse(id: string, sampleCount = 0): { item: AssistantItemType | null } {
        if (!id) {
            this._realtimeApi.send('response.cancel');
            return { item: null };
        } else {
            const item = this.realtimeConversation.getItem(id);
            if (!item) {
                throw new Error(`Could not find item "${id}"`);
            }
            if (item.type !== 'message') {
                throw new Error(`Can only cancelResponse messages with type "message"`);
            } else if (item.role !== 'assistant') {
                throw new Error(
                    `Can only cancelResponse messages with role "assistant"`,
                );
            }
            this._realtimeApi.send('response.cancel');
            const audioIndex = item.content.findIndex((c) => c.type === 'audio');
            if (audioIndex === -1) {
                throw new Error(`Could not find audio on item to cancel`);
            }
            this._realtimeApi.send('conversation.item.truncate', {
                item_id: id,
                content_index: audioIndex,
                audio_end_ms: Math.floor(
                    (sampleCount / this.realtimeConversation.defaultFrequency) * 1000,
                ),
            });
            return { item };
        }
    }

    async waitForNextItem(): Promise<{ item: ItemType }> {
        const event = await this.waitForNext('conversation.item.appended');
        // @ts-ignore
        const { item } = event;
        return { item };
    }

    async waitForNextCompletedItem(): Promise<{ item: ItemType }> {
        const event = await this.waitForNext('conversation.item.completed');
        // @ts-ignore
        const { item } = event;
        return { item };
    }
}
