/**
 * EventHandler callback
 */
type EventHandlerCallbackType = (event: Record<string, any>) => void;

const sleep = (t: number): Promise<void> => new Promise((r) => setTimeout(r, t));

/**
 * Inherited class for RealtimeAPI and RealtimeClient
 * Adds basic event handling
 */
export class RealtimeEventHandler {
    private eventHandlers: Record<string, EventHandlerCallbackType[]>;
    private nextEventHandlers: Record<string, EventHandlerCallbackType[]>;

    /**
     * Create a new RealtimeEventHandler instance
     */
    constructor() {
        this.eventHandlers = {};
        this.nextEventHandlers = {};
    }

    /**
     * Clears all event handlers
     */
    clearEventHandlers(): true {
        this.eventHandlers = {};
        this.nextEventHandlers = {};
        return true;
    }

    /**
     * Listen to specific events
     * @param eventName The name of the event to listen to
     * @param callback Code to execute on event
     */
    on(eventName: string, callback: EventHandlerCallbackType): EventHandlerCallbackType {
        this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
        this.eventHandlers[eventName].push(callback);
        return callback;
    }

    /**
     * Listen for the next event of a specified type
     * @param eventName The name of the event to listen to
     * @param callback Code to execute on event
     */
    onNext(eventName: string, callback: EventHandlerCallbackType): EventHandlerCallbackType {
        this.nextEventHandlers[eventName] = this.nextEventHandlers[eventName] || [];
        this.nextEventHandlers[eventName].push(callback);
        return callback;
    }

    /**
     * Turns off event listening for specific events
     * Calling without a callback will remove all listeners for the event
     * @param eventName
     * @param callback
     */
    off(eventName: string, callback?: EventHandlerCallbackType): true {
        const handlers = this.eventHandlers[eventName] || [];
        if (callback) {
            const index = handlers.indexOf(callback);
            if (index === -1) {
                throw new Error(
                    `Could not turn off specified event listener for "${eventName}": not found as a listener`,
                );
            }
            handlers.splice(index, 1);
        } else {
            delete this.eventHandlers[eventName];
        }
        return true;
    }

    /**
     * Turns off event listening for the next event of a specific type
     * Calling without a callback will remove all listeners for the next event
     * @param eventName
     * @param callback
     */
    offNext(eventName: string, callback?: EventHandlerCallbackType): true {
        const nextHandlers = this.nextEventHandlers[eventName] || [];
        if (callback) {
            const index = nextHandlers.indexOf(callback);
            if (index === -1) {
                throw new Error(
                    `Could not turn off specified next event listener for "${eventName}": not found as a listener`,
                );
            }
            nextHandlers.splice(index, 1);
        } else {
            delete this.nextEventHandlers[eventName];
        }
        return true;
    }

    /**
     * Waits for next event of a specific type and returns the payload
     * @param eventName
     * @param timeout
     */
    async waitForNext(eventName: string, timeout: number | null = null): Promise<Record<string, any> | null> {
        const t0 = Date.now();
        let nextEvent: Record<string, any> | undefined;
        this.onNext(eventName, (event) => (nextEvent = event));
        while (!nextEvent) {
            if (timeout !== null) {
                const t1 = Date.now();
                if (t1 - t0 > timeout) {
                    return null;
                }
            }
            await sleep(1);
        }
        return nextEvent;
    }

    /**
     * Executes all events in the order they were added, with .on() event handlers executing before .onNext() handlers
     * @param eventName
     * @param event
     */
    dispatch(eventName: string, event?: any): true {
        console.log("event: ", eventName, this.eventHandlers[eventName]);
        const handlers = this.eventHandlers[eventName] || [];
        for (const handler of handlers) {
            handler(event);
        }
        const nextHandlers = this.nextEventHandlers[eventName] || [];
        for (const nextHandler of nextHandlers) {
            nextHandler(event);
        }
        delete this.nextEventHandlers[eventName];
        return true;
    }
}
