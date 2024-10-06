// OpenAi realtime utils

/**
 * Basic utilities for the RealtimeAPI
 * @class
 */
export default class RealtimeUtils {
    /**
     * Converts Float32Array of amplitude data to ArrayBuffer in Int16Array format
     * @param {Float32Array} float32Array
     * @returns {ArrayBuffer}
     */
    static floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8001 : s * 0x7fff, true);
        }
        return buffer;
    }

    /**
     * Converts a base64 string to an ArrayBuffer
     * @param {string} base64
     * @returns {ArrayBuffer}
     */
    static base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Converts an ArrayBuffer, Int16Array or Float32Array to a base64 string
     * @param {ArrayBuffer|Int16Array|Float32Array} arrayBuffer
     * @returns {string}
     */
    static arrayBufferToBase64(arrayBuffer) {
        if (arrayBuffer instanceof Float32Array) {
            arrayBuffer = this.floatTo16BitPCM(arrayBuffer);
        } else if (arrayBuffer instanceof Int16Array) {
            arrayBuffer = arrayBuffer.buffer;
        }
        let binary = '';
        let bytes = new Uint8Array(arrayBuffer);
        const chunkSize = 0x8000; // 32KB chunk size
        for (let i = 0; i < bytes.length; i += chunkSize) {
            let chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    /**
     * Merge two Int16Arrays from Int16Arrays or ArrayBuffers
     * @param {ArrayBuffer|Int16Array} left
     * @param {ArrayBuffer|Int16Array} right
     * @returns {Int16Array}
     */
    static mergeInt16Arrays(left, right) {
        if (left instanceof ArrayBuffer) {
            left = new Int16Array(left);
        }
        if (right instanceof ArrayBuffer) {
            right = new Int16Array(right);
        }
        if (!(left instanceof Int16Array) || !(right instanceof Int16Array)) {
            throw new Error(`Both items must be Int16Array`);
        }
        const newValues = new Int16Array(left.length + right.length);
        for (let i = 0; i < left.length; i++) {
            newValues[i] = left[i];
        }
        for (let j = 0; j < right.length; j++) {
            newValues[left.length + j] = right[j];
        }
        return newValues;
    }

    /**
     * Generates an id to send with events and messages
     * @param {string} prefix
     * @param {number} [length]
     * @returns {string}
     */
    static generateId(prefix, length = 21) {
        // base58; non-repeating chars
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const str = Array(length - prefix.length)
            .fill(0)
            .map((_) => chars[Math.floor(Math.random() * chars.length)])
            .join('');
        return `${prefix}${str}`;
    }

    /**
     * Converts PCM16 data to Float32Array.
     * @param {ArrayBuffer} pcmData - The raw PCM16 data.
     * @returns {Float32Array} - The normalized audio samples.
     */
    static pcmArrayBufferToFloat32(pcmData) {
        const dataView = new DataView(pcmData);
        const numSamples = pcmData.byteLength / 2; // 16 bits = 2 bytes per sample
        const float32Array = new Float32Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            const pcmValue = dataView.getInt16(i * 2, true); // true for little-endian
            float32Array[i] = pcmValue / 32768; // Normalize to [-1, 1]
        }

        return float32Array;
    }


    static resample(inputData, inputSampleRate, outputSampleRate) {
        const sampleRatio = inputSampleRate / outputSampleRate;
        const newLength = Math.round(inputData.length / sampleRatio);
        const resampledData = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const index = i * sampleRatio;
            const lower = Math.floor(index);
            const upper = lower + 1;
            const weight = index - lower;

            resampledData[i] = inputData[lower] * (1 - weight) + (inputData[upper] || 0) * weight;
        }
        return resampledData;
    }
}

