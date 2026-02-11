/**
 * AudioVisualizer
 * Renders a real-time waveform on a canvas using an AnalyserNode.
 */
export class AudioVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.analyser = null;
    this.dataArray = null;
    this.bufferLength = 0;
    this.isPlaying = false;
    this.animationId = null;

    // Canvas sizing
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
    this.analyser.fftSize = 2048;
    this.bufferLength = this.analyser.fftSize;
    this.dataArray = new Uint8Array(this.bufferLength);
  }

  start() {
    if (!this.analyser || this.isPlaying) return;
    this.isPlaying = true;
    this.draw();
  }

  stop() {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    // Clear canvas
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  draw(timestamp) {
    if (!this.isPlaying) return;

    this.animationId = requestAnimationFrame((t) => this.draw(t));

    // Limit to ~30fps for gentler movement
    if (!this.lastDrawTime) this.lastDrawTime = 0;
    if (timestamp - this.lastDrawTime < 33) {
      return;
    }
    this.lastDrawTime = timestamp;

    this.analyser.getByteTimeDomainData(this.dataArray);

    const width = this.canvas.width / window.devicePixelRatio;
    const height = this.canvas.height / window.devicePixelRatio;

    this.ctx.clearRect(0, 0, width, height);

    this.ctx.lineWidth = 4; // Thicker line

    // Gradient for edge fading
    const gradient = this.ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(255, 105, 180, 0)');
    gradient.addColorStop(0.15, 'rgba(255, 105, 180, 1)');
    gradient.addColorStop(0.85, 'rgba(255, 105, 180, 1)');
    gradient.addColorStop(1, 'rgba(255, 105, 180, 0)');

    this.ctx.strokeStyle = gradient;
    this.ctx.shadowBlur = 20; // More glow
    this.ctx.shadowColor = '#ff69b4';
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();

    // Downsample: Draw fewer points to make it smoother
    // We step through the buffer, skipping points
    const step = Math.ceil(this.bufferLength / 20); // Much fewer points (e.g. 100 points -> 20 curves?)
    // Actually buffer is 2048. step ~100 -> ~20 points total. Very smooth.

    const sliceWidth = (width * 1.0) / (this.bufferLength / step);
    let x = 0;

    // First point
    const v = this.dataArray[0] / 128.0;
    let y = (v * height) / 2;
    this.ctx.moveTo(x, y);

    for (let i = step; i < this.bufferLength; i += step) {
      // Average the chunk for better representation? Or just sample?
      // Sampling is fine for "visualizer" effect.
      const v = this.dataArray[i] / 128.0;
      const nextY = (v * height) / 2;
      const nextX = x + sliceWidth;

      // Control point for quadratic curve (midpoint)
      const midX = (x + nextX) / 2;
      const midY = (y + nextY) / 2;

      this.ctx.quadraticCurveTo(x, y, midX, midY);

      x = nextX;
      y = nextY;
    }

    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
  }
}
