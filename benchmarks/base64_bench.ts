import { performance } from 'perf_hooks';
import { fastBase64Decode } from '../src/utils/base64.js';

function generateBase64(size: number): string {
  const buf = Buffer.alloc(size);
  return buf.toString('base64');
}

function runBenchmark(label: string, str: string, iterations: number) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    Buffer.from(str, 'base64');
  }
  const end = performance.now();
  const total = end - start;
  const perOp = total / iterations;
  console.log(`${label} (Buffer.from): ${iterations} iterations, Total: ${total.toFixed(2)}ms, Per Op: ${perOp.toFixed(4)}ms`);
}

function runBenchmarkAlloc(label: string, str: string, iterations: number, size: number) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const buf = Buffer.allocUnsafe(size);
    buf.write(str, 'base64');
  }
  const end = performance.now();
  const total = end - start;
  const perOp = total / iterations;
  console.log(`${label} (allocUnsafe manual): ${iterations} iterations, Total: ${total.toFixed(2)}ms, Per Op: ${perOp.toFixed(4)}ms`);
}

function runBenchmarkFast(label: string, str: string, iterations: number) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fastBase64Decode(str);
  }
  const end = performance.now();
  const total = end - start;
  const perOp = total / iterations;
  console.log(`${label} (fastBase64Decode): ${iterations} iterations, Total: ${total.toFixed(2)}ms, Per Op: ${perOp.toFixed(4)}ms`);
}

const sizes = [1024, 4096, 65536, 1048576]; // 1KB, 4KB, 64KB, 1MB
const iterations = 10000;

console.log('--- Benchmark: Buffer.from vs fastBase64Decode ---');
for (const size of sizes) {
  const str = generateBase64(size);
  // iterations adjusted for larger sizes?
  const loops = size > 65536 ? 1000 : 10000;

  runBenchmark(`${size} bytes`, str, loops);
  // runBenchmarkAlloc(`${size} bytes`, str, loops, size);
  runBenchmarkFast(`${size} bytes`, str, loops);
  console.log('---');
}
