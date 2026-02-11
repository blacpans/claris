class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.index = 0;
    this.OUT_SAMPLE_RATE = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];

      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.index++] = channelData[i];
        if (this.index >= this.bufferSize) {
          this.flush();
          this.index = 0;
        }
      }
    }
    return true;
  }

  flush() {
    // 1. RMS Calculation
    let sum = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      sum += this.buffer[i] * this.buffer[i];
    }
    const rms = Math.sqrt(sum / this.bufferSize);

    // 2. Downsampling
    const downsampled = this.downsampleBuffer(this.buffer, sampleRate, this.OUT_SAMPLE_RATE);

    // 3. Conversion to Int16
    const int16Data = this.convertFloat32ToInt16(downsampled);

    // 4. Post Message (Transfer ArrayBuffer for performance)
    this.port.postMessage(
      {
        type: 'audio',
        data: int16Data.buffer,
        rms: rms,
      },
      [int16Data.buffer],
    );
  }

  downsampleBuffer(buffer, sampleRate, outSampleRate) {
    if (outSampleRate === sampleRate) return buffer;
    if (outSampleRate > sampleRate) return buffer; // Up-sampling not supported

    const ratio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalPos = i * ratio;
      const index = Math.floor(originalPos);
      const decimal = originalPos - index;

      const y0 = buffer[index] || 0;
      const y1 = buffer[index + 1] || y0;

      result[i] = y0 + (y1 - y0) * decimal;
    }
    return result;
  }

  convertFloat32ToInt16(buffer) {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) {
      const s = Math.max(-1, Math.min(1, buffer[l]));
      buf[l] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return buf;
  }
}

registerProcessor('audio-processor', AudioProcessor);
