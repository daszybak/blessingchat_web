import {
  noteFrequencies,
  noteFrequencyLabels,
  voiceFrequencies,
  voiceFrequencyLabels,
} from './constants';

/**
 * Output of AudioAnalysis for the frequency domain of the audio
 */
export interface AudioAnalysisOutputType {
  values: Float32Array; // Amplitude of this frequency between {0, 1} inclusive
  frequencies: number[]; // Raw frequency bucket values
  labels: string[]; // Labels for the frequency bucket values
}

/**
 * Analyzes audio for visual output
 */
export class AudioAnalysis {
  private fftResults: Float32Array[];
  private audio: HTMLAudioElement;
  private context: AudioContext | OfflineAudioContext;
  private analyser: AnalyserNode;
  private sampleRate: number;
  private audioBuffer: AudioBuffer | null;

  /**
   * Retrieves frequency domain data from an AnalyserNode adjusted to a decibel range
   * returns human-readable formatting and labels
   */
  static getFrequencies(
    analyser: AnalyserNode,
    sampleRate: number,
    fftResult?: Float32Array,
    analysisType: 'frequency' | 'music' | 'voice' = 'frequency',
    minDecibels: number = -100,
    maxDecibels: number = -30,
  ): AudioAnalysisOutputType {
    if (!fftResult) {
      fftResult = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(fftResult);
    }
    const nyquistFrequency = sampleRate / 2;
    const frequencyStep = (1 / fftResult.length) * nyquistFrequency;
    let outputValues: number[];
    let frequencies: number[];
    let labels: string[];
    if (analysisType === 'music' || analysisType === 'voice') {
      const useFrequencies =
        analysisType === 'voice' ? voiceFrequencies : noteFrequencies;
      const aggregateOutput = Array(useFrequencies.length).fill(minDecibels);
      for (let i = 0; i < fftResult.length; i++) {
        const frequency = i * frequencyStep;
        const amplitude = fftResult[i];
        for (let n = useFrequencies.length - 1; n >= 0; n--) {
          if (frequency > useFrequencies[n]) {
            aggregateOutput[n] = Math.max(aggregateOutput[n], amplitude);
            break;
          }
        }
      }
      outputValues = aggregateOutput;
      frequencies =
        analysisType === 'voice' ? voiceFrequencies : noteFrequencies;
      labels =
        analysisType === 'voice' ? voiceFrequencyLabels : noteFrequencyLabels;
    } else {
      outputValues = Array.from(fftResult);
      frequencies = outputValues.map((_, i) => frequencyStep * i);
      labels = frequencies.map((f) => `${f.toFixed(2)} Hz`);
    }
    // We normalize to {0, 1}
    const normalizedOutput = outputValues.map((v) => {
      return Math.max(
        0,
        Math.min((v - minDecibels) / (maxDecibels - minDecibels), 1),
      );
    });
    const values = new Float32Array(normalizedOutput);
    return {
      values,
      frequencies,
      labels,
    };
  }

  /**
   * Creates a new AudioAnalysis instance for an HTMLAudioElement
   */
  constructor(audioElement: HTMLAudioElement, audioBuffer: AudioBuffer | null = null) {
    this.fftResults = [];
    if (audioBuffer) {
      /**
       * Modified from
       * https://stackoverflow.com/questions/75063715/using-the-web-audio-api-to-analyze-a-song-without-playing
       *
       * We do this to populate FFT values for the audio if provided an `audioBuffer`
       * The reason to do this is that Safari fails when using `createMediaElementSource`
       * This has a non-zero RAM cost so we only opt-in to run it on Safari, Chrome is better
       */
      const { length, sampleRate } = audioBuffer;
      const offlineAudioContext = new OfflineAudioContext({
        length,
        sampleRate,
      });
      const source = offlineAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      const analyser = offlineAudioContext.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
      // limit is :: 128 / sampleRate;
      // but we just want 60fps - cuts ~1s from 6MB to 1MB of RAM
      const renderQuantumInSeconds = 1 / 60;
      const durationInSeconds = length / sampleRate;
      const analyze = (index: number) => {
        const suspendTime = renderQuantumInSeconds * index;
        if (suspendTime < durationInSeconds) {
          offlineAudioContext.suspend(suspendTime).then(() => {
            const fftResult = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(fftResult);
            this.fftResults.push(fftResult);
            analyze(index + 1);
          });
        }
        if (index === 1) {
          offlineAudioContext.startRendering();
        } else {
          offlineAudioContext.resume();
        }
      };
      source.start(0);
      analyze(1);
      this.audio = audioElement;
      this.context = offlineAudioContext;
      this.analyser = analyser;
      this.sampleRate = sampleRate;
      this.audioBuffer = audioBuffer;
    } else {
      const audioContext = new AudioContext();
      const track = audioContext.createMediaElementSource(audioElement);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.1;
      track.connect(analyser);
      analyser.connect(audioContext.destination);
      this.audio = audioElement;
      this.context = audioContext;
      this.analyser = analyser;
      this.sampleRate = this.context.sampleRate;
      this.audioBuffer = null;
    }
  }

  /**
   * Gets the current frequency domain data from the playing audio track
   */
  getFrequencies(
    analysisType: 'frequency' | 'music' | 'voice' = 'frequency',
    minDecibels: number = -100,
    maxDecibels: number = -30,
  ): AudioAnalysisOutputType {
    let fftResult: Float32Array | undefined;
    if (this.audioBuffer && this.fftResults.length) {
      const pct = this.audio.currentTime / this.audio.duration;
      const index = Math.min(
        Math.floor(pct * this.fftResults.length),
        this.fftResults.length - 1,
      );
      fftResult = this.fftResults[index];
    }
    return AudioAnalysis.getFrequencies(
      this.analyser,
      this.sampleRate,
      fftResult,
      analysisType,
      minDecibels,
      maxDecibels,
    );
  }

  /**
   * Resume the internal AudioContext if it was suspended due to the lack of
   * user interaction when the AudioAnalysis was instantiated.
   */
  async resumeIfSuspended(): Promise<true> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    return true;
  }
}

(globalThis as any).AudioAnalysis = AudioAnalysis;
