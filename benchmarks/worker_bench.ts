import { Worker, isMainThread, parentPort } from 'worker_threads';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const iterations = 100; // Reduce iterations for large size
const size = 1048576; // 1MB
const str = Buffer.alloc(size).toString('base64');

if (isMainThread) {
  const worker = new Worker(__filename);

  let received = 0;
  let startTime = 0;

  worker.on('message', (msg) => {
    if (msg === 'ready') {
      console.log('Worker ready, starting benchmark...');
      startTime = performance.now();

      const startPost = performance.now();
      for (let i = 0; i < iterations; i++) {
        worker.postMessage({ str, id: i });
      }
      const endPost = performance.now();
      console.log(`Main Thread PostMessage time: ${(endPost - startPost).toFixed(2)}ms for ${iterations} calls. Per op: ${((endPost - startPost)/iterations).toFixed(4)}ms`);
    } else {
      // Received result
      received++;
      if (received === iterations) {
        const end = performance.now();
        const total = end - startTime;
        const perOp = total / iterations;
        console.log(`Worker Total Roundtrip: ${iterations} iterations (1MB), Total: ${total.toFixed(2)}ms, Per Op: ${perOp.toFixed(4)}ms`);
        worker.terminate();
        process.exit(0);
      }
    }
  });

} else {
  parentPort?.postMessage('ready');
  parentPort?.on('message', (msg) => {
    const buf = Buffer.from(msg.str, 'base64');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    parentPort?.postMessage(ab, [ab]);
  });
}
