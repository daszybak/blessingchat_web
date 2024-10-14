export class Logger {
    private _logs: any[];
    private _name: string;
    private _debug: boolean;
    constructor(name: string, debug: boolean = false) {
        this._name = name;
        this._debug = debug;
        this._logs = [];
    }
    getLogs() {
        return this._logs;
    }
    clearLogs() {
        this._logs = [];
    }
    log(...args: any) {
        const date = new Date().toISOString();
        const logs = [`[${this._name}/${date}]`].concat(args).map((arg) => {
            if (typeof arg === 'object' && arg !== null) {
                return JSON.stringify(arg, null, 2);
            } else {
                return arg;
            }
        });
        if (this._debug) {
            console.log(...logs);
        }
        return true;
    }
}
