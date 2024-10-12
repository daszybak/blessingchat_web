import { AudioProcessorSrc } from './worklets/audio_processor';
import { AudioAnalysis, AudioAnalysisOutputType } from './analysis/audio_analysis';
import { WavPacker, WavPackerAudioType } from './wav_packer';

/**
 * Decodes audio into a wav file
 */
interface DecodedAudioType {
  blob: Blob;
  url: string;
  values: Float32Array;
  audioBuffer: AudioBuffer;
}

/**
 * Records live stream of user audio as PCM16 "audio/wav" data
 */
export class WavRecorder {
  private scriptSrc: string;
  private sampleRate: number;
  private outputToSpeakers: boolean;
  private debug: boolean;
  private _deviceChangeCallback: ((devices: Array<MediaDeviceInfo & { default: boolean }>) => void) | null;
  private _devices: Array<MediaDeviceInfo & { default: boolean }>;
  private stream: MediaStream | null;
  private processor: AudioWorkletNode | null;
  private source: MediaStreamAudioSourceNode | null;
  private node: AudioNode | null;
  private analyser: AnalyserNode | null = null;
  private recording: boolean;
  private _lastEventId: number;
  private eventReceipts: { [key: number]: any };
  private eventTimeout: number;
  private _chunkProcessor: (data: { mono: Int16Array; raw: Int16Array }) => void;
  private _chunkProcessorSize: number | undefined;
  private _chunkProcessorBuffer: {
    raw: ArrayBuffer;
    mono: ArrayBuffer;
  };

  /**
   * Create a new WavRecorder instance
   */
  constructor({
    sampleRate = 44100,
    outputToSpeakers = false,
    debug = false,
  }: {
    sampleRate?: number;
    outputToSpeakers?: boolean;
    debug?: boolean;
  } = {}) {
    // Script source
    this.scriptSrc = AudioProcessorSrc;
    // Config
    this.sampleRate = sampleRate;
    this.outputToSpeakers = outputToSpeakers;
    this.debug = !!debug;
    this._deviceChangeCallback = null;
    this._devices = [];
    // State variables
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.node = null;
    this.recording = false;
    // Event handling with AudioWorklet
    this._lastEventId = 0;
    this.eventReceipts = {};
    this.eventTimeout = 5000;
    // Process chunks of audio
    this._chunkProcessor = () => { };
    this._chunkProcessorSize = undefined;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0),
    };
  }

  /**
   * Decodes audio data from multiple formats to a Blob, url, Float32Array and AudioBuffer
   */
  static async decode(audioData: Blob | ArrayBuffer | Int16Array | Float32Array | number[], sampleRate = 44100, fromSampleRate = -1): Promise<DecodedAudioType> {
    const context = new AudioContext({ sampleRate });
    let arrayBuffer: ArrayBuffer;
    let blob: Blob;
    if (audioData instanceof Blob) {
      if (fromSampleRate !== -1) {
        throw new Error(
          `Can not specify "fromSampleRate" when reading from Blob`,
        );
      }
      blob = audioData;
      arrayBuffer = await blob.arrayBuffer();
    } else if (audioData instanceof ArrayBuffer) {
      if (fromSampleRate !== -1) {
        throw new Error(
          `Can not specify "fromSampleRate" when reading from ArrayBuffer`,
        );
      }
      arrayBuffer = audioData;
      blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    } else {
      let float32Array: Float32Array;
      let data: Int16Array | undefined;
      if (audioData instanceof Int16Array) {
        data = audioData;
        float32Array = new Float32Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          float32Array[i] = audioData[i] / 0x8000;
        }
      } else if (audioData instanceof Float32Array) {
        float32Array = audioData;
      } else if (Array.isArray(audioData)) {
        float32Array = new Float32Array(audioData);
      } else {
        throw new Error(
          `"audioData" must be one of: Blob, Float32Array, Int16Array, ArrayBuffer, Array<number>`,
        );
      }
      if (fromSampleRate === -1) {
        throw new Error(
          `Must specify "fromSampleRate" when reading from Float32Array, Int16Array or Array`,
        );
      } else if (fromSampleRate < 3000) {
        throw new Error(`Minimum "fromSampleRate" is 3000 (3kHz)`);
      }
      if (!data) {
        // @ts-ignore
        data = WavPacker.floatTo16BitPCM(float32Array);
      }
      const audio = {
        bitsPerSample: 16,
        channels: [float32Array],
        data,
      };
      const packer = new WavPacker();
      // @ts-ignore
      const result = packer.pack(fromSampleRate, audio);
      blob = result.blob;
      arrayBuffer = await blob.arrayBuffer();
    }
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    const values = audioBuffer.getChannelData(0);
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      values,
      audioBuffer,
    };
  }

  /**
   * Logs data in debug mode
   */
  log(...args: any[]): true {
    if (this.debug) {
      console.log(...args);
    }
    return true;
  }

  /**
   * Retrieves the current sampleRate for the recorder
   */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Retrieves the current status of the recording
   */
  getStatus(): "ended" | "paused" | "recording" {
    if (!this.processor) {
      return 'ended';
    } else if (!this.recording) {
      return 'paused';
    } else {
      return 'recording';
    }
  }

  /**
   * Sends an event to the AudioWorklet
   */
  private async _event(name: string, data: { [key: string]: any } = {}, _processor: AudioWorkletNode | null = null): Promise<{ [key: string]: any }> {
    _processor = _processor || this.processor;
    if (!_processor) {
      throw new Error('Can not send events without recording first');
    }
    const message = {
      event: name,
      id: this._lastEventId++,
      data,
    };
    _processor.port.postMessage(message);
    const t0 = new Date().valueOf();
    while (!this.eventReceipts[message.id]) {
      if (new Date().valueOf() - t0 > this.eventTimeout) {
        throw new Error(`Timeout waiting for "${name}" event`);
      }
      await new Promise((res) => setTimeout(() => res(true), 1));
    }
    const payload = this.eventReceipts[message.id];
    delete this.eventReceipts[message.id];
    return payload;
  }

  /**
   * Sets device change callback, remove if callback provided is `null`
   */
  listenForDeviceChange(callback: ((devices: Array<MediaDeviceInfo & { default: boolean }>) => void) | null): true {
    if (callback === null && this._deviceChangeCallback) {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        // @ts-ignore
        this._deviceChangeCallback,
      );
      this._deviceChangeCallback = null;
    } else if (callback !== null) {
      // Basically a debounce; we only want this called once when devices change
      // And we only want the most recent callback() to be executed
      // if a few are operating at the same time
      let lastId = 0;
      let lastDevices: Array<MediaDeviceInfo & { default: boolean }> = [];
      const serializeDevices = (devices: Array<MediaDeviceInfo & { default: boolean }>) =>
        devices
          .map((d) => d.deviceId)
          .sort()
          .join(',');
      const cb = async () => {
        let id = ++lastId;
        const devices = await this.listDevices();
        if (id === lastId) {
          if (serializeDevices(lastDevices) !== serializeDevices(devices)) {
            lastDevices = devices;
            callback(devices.slice());
          }
        }
      };
      navigator.mediaDevices.addEventListener('devicechange', cb);
      cb();
      this._deviceChangeCallback = cb;
    }
    return true;
  }

  /**
   * Manually request permission to use the microphone
   */
  async requestPermission(): Promise<true> {
    const permissionStatus = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    if (permissionStatus.state === 'denied') {
      window.alert('You must grant microphone access to use this feature.');
    } else if (permissionStatus.state === 'prompt') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {
        window.alert('You must grant microphone access to use this feature.');
      }
    }
    return true;
  }

  /**
   * List all eligible devices for recording, will request permission to use microphone
   */
  async listDevices(): Promise<Array<MediaDeviceInfo & { default: boolean }>> {
    if (
      !navigator.mediaDevices ||
      !('enumerateDevices' in navigator.mediaDevices)
    ) {
      throw new Error('Could not request user devices');
    }
    await this.requestPermission();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(
      (device) => device.kind === 'audioinput',
    );
    const defaultDeviceIndex = audioDevices.findIndex(
      (device) => device.deviceId === 'default',
    );
    const deviceList: Array<MediaDeviceInfo & { default: boolean }> = [];
    if (defaultDeviceIndex !== -1) {
      let defaultDevice = audioDevices.splice(defaultDeviceIndex, 1)[0] as MediaDeviceInfo & { default: boolean };
      let existingIndex = audioDevices.findIndex(
        (device) => device.groupId === defaultDevice.groupId,
      );
      if (existingIndex !== -1) {
        defaultDevice = audioDevices.splice(existingIndex, 1)[0] as MediaDeviceInfo & { default: boolean };
      }
      defaultDevice.default = true;
      deviceList.push(defaultDevice);
    }
    return deviceList.concat(audioDevices.map(device => ({ ...device, default: false })));
  }

  /**
   * Begins a recording session and requests microphone permissions if not already granted
   * Microphone recording indicator will appear on browser tab but status will be "paused"
   */
  async begin(deviceId?: string): Promise<true> {
    if (this.processor) {
      throw new Error(
        `Already connected: please call .end() to start a new session`,
      );
    }

    if (
      !navigator.mediaDevices ||
      !('getUserMedia' in navigator.mediaDevices)
    ) {
      throw new Error('Could not request user media');
    }
    try {
      const config: MediaStreamConstraints = { audio: true };
      if (deviceId) {
        config.audio = { deviceId: { exact: deviceId } };
      }
      this.stream = await navigator.mediaDevices.getUserMedia(config);
    } catch (err) {
      throw new Error('Could not start media stream');
    }

    const context = new AudioContext({ sampleRate: this.sampleRate });
    const source = context.createMediaStreamSource(this.stream);
    // Load and execute the module script.
    try {
      await context.audioWorklet.addModule(this.scriptSrc);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not add audioWorklet module: ${this.scriptSrc}`);
    }
    const processor = new AudioWorkletNode(context, 'audio_processor');
    processor.port.onmessage = (e: MessageEvent) => {
      const { event, id, data } = e.data;
      if (event === 'receipt') {
        this.eventReceipts[id] = data;
      } else if (event === 'chunk') {
        if (this._chunkProcessorSize) {
          const buffer = this._chunkProcessorBuffer;
          this._chunkProcessorBuffer = {
            raw: WavPacker.mergeBuffers(buffer.raw, data.raw),
            mono: WavPacker.mergeBuffers(buffer.mono, data.mono),
          };
          if (
            this._chunkProcessorBuffer.mono.byteLength >=
            this._chunkProcessorSize
          ) {
            this._chunkProcessor({
              mono: new Int16Array(this._chunkProcessorBuffer.mono),
              raw: new Int16Array(this._chunkProcessorBuffer.raw)
            });
            this._chunkProcessorBuffer = {
              raw: new ArrayBuffer(0),
              mono: new ArrayBuffer(0),
            };
          }
        } else {
          this._chunkProcessor(data);
        }
      }
    };

    const node = source.connect(processor);
    const analyser = context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.1;
    node.connect(analyser);
    if (this.outputToSpeakers) {
      // eslint-disable-next-line no-console
      console.warn(
        'Warning: Output to speakers may affect sound quality,\n' +
        'especially due to system audio feedback preventative measures.\n' +
        'use only for debugging',
      );
      analyser.connect(context.destination);
    }

    this.source = source;
    this.node = node;
    this.analyser = analyser;
    this.processor = processor;
    return true;
  }

  /**
   * Gets the current frequency domain data from the recording track
   */
  getFrequencies(
    analysisType: "frequency" | "music" | "voice" = 'frequency',
    minDecibels: number = -100,
    maxDecibels: number = -30,
  ): AudioAnalysisOutputType {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    if (!this.analyser) {
      throw new Error('Analyser not initialized');
    }
    return AudioAnalysis.getFrequencies(
      this.analyser,
      this.sampleRate,
      undefined,
      analysisType,
      minDecibels,
      maxDecibels,
    );
  }

  /**
   * Pauses the recording
   * Keeps microphone stream open but halts storage of audio
   */
  async pause(): Promise<true> {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    } else if (!this.recording) {
      throw new Error('Already paused: please call .record() first');
    }
    if (this._chunkProcessorBuffer.raw.byteLength) {
      this._chunkProcessor({
        mono: new Int16Array(this._chunkProcessorBuffer.mono),
        raw: new Int16Array(this._chunkProcessorBuffer.raw)
      });
    }
    this.log('Pausing ...');
    await this._event('stop');
    this.recording = false;
    return true;
  }

  /**
   * Start recording stream and storing to memory from the connected audio source
   */
  async record(chunkProcessor: (data: { mono: Int16Array; raw: Int16Array }) => any = () => { }, chunkSize: number = 8192): Promise<true> {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    } else if (this.recording) {
      throw new Error('Already recording: please call .pause() first');
    } else if (typeof chunkProcessor !== 'function') {
      throw new Error(`chunkProcessor must be a function`);
    }
    this._chunkProcessor = chunkProcessor;
    this._chunkProcessorSize = chunkSize;
    this._chunkProcessorBuffer = {
      raw: new ArrayBuffer(0),
      mono: new ArrayBuffer(0),
    };
    this.log('Recording ...');
    await this._event('start');
    this.recording = true;
    return true;
  }

  /**
   * Clears the audio buffer, empties stored recording
   */
  async clear(): Promise<true> {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    await this._event('clear');
    return true;
  }

  /**
   * Reads the current audio stream data
   */
  async read(): Promise<{ meanValues: Float32Array, channels: Array<Float32Array> }> {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    this.log('Reading ...');
    const result = await this._event('read') as Promise<{ meanValues: Float32Array, channels: Array<Float32Array> }>;
    return result;
  }

  /**
   * Saves the current audio stream to a file
   * @param {boolean} [force] Force saving while still recording
   */
  async save(force: boolean = false): Promise<WavPackerAudioType> {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }
    if (!force && this.recording) {
      throw new Error(
        'Currently recording: please call .pause() first, or call .save(true) to force',
      );
    }
    this.log('Exporting ...');
    const exportData = await this._event('export');
    const packer = new WavPacker();
    const result = packer.pack(this.sampleRate, exportData.audio);
    return result;
  }

  /**
   * Ends the current recording session and saves the result
   */
  async end(): Promise<WavPackerAudioType> {
    if (!this.processor) {
      throw new Error('Session ended: please call .begin() first');
    }

    const _processor = this.processor;

    this.log('Stopping ...');
    await this._event('stop');
    this.recording = false;
    if (this.stream) {
      const tracks = this.stream.getTracks();
      tracks.forEach((track) => track.stop());
    }

    this.log('Exporting ...');
    const exportData = await this._event('export', {}, _processor);

    if (this.processor) this.processor.disconnect();
    if (this.source) this.source.disconnect();
    if (this.node) this.node.disconnect();
    if (this.analyser) this.analyser.disconnect();
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.node = null;

    const packer = new WavPacker();
    const result = packer.pack(this.sampleRate, exportData.audio);
    return result;
  }

  /**
   * Performs a full cleanup of WavRecorder instance
   * Stops actively listening via microphone and removes existing listeners
   */
  async quit(): Promise<true> {
    this.listenForDeviceChange(null);
    if (this.processor) {
      await this.end();
    }
    return true;
  }
}

(globalThis as any).WavRecorder = WavRecorder;
