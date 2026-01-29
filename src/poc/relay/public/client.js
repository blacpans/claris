const TARGET_SAMPLE_RATE = 24000; 

let ws;
let audioContext;
let audioWorkletNode;
let sourceNode;
let videoStream;
let videoInterval;
let nextStartTime = 0;

const videoPreview = document.getElementById('videoPreview');
const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const logArea = document.getElementById('logArea');

function log(msg) {
    const div = document.createElement('div');
    div.textContent = `> ${msg}`;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight;
    console.log(msg); // Also log to console
}

function updateStatus(state) {
    if (state === 'connected') {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected (Soul Unison)';
        btnConnect.disabled = true;
        btnDisconnect.disabled = false;
    } else {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Disconnected';
        btnConnect.disabled = false;
        btnDisconnect.disabled = true;
    }
}

async function startAudioInput() {
    try {
        // Use default sample rate (usually 44.1k or 48k)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        log(`🔊 AudioContext created at ${audioContext.sampleRate}Hz`);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
            channelCount: 1,
            echoCancellation: true, // Echo cancellation is vital for speaker output
            noiseSuppression: true,
            autoGainControl: true
        }});
        
        await audioContext.audioWorklet.addModule('data:text/javascript;base64,' + btoa(`
            class AudioProcessor extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this.buffer = [];
                }
                process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (input.length > 0) {
                        const channelData = input[0];
                        this.port.postMessage(channelData);
                    }
                    return true;
                }
            }
            registerProcessor('audio-processor', AudioProcessor);
        `));
        
        sourceNode = audioContext.createMediaStreamSource(stream);
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        sourceNode.connect(audioWorkletNode);
        
        audioWorkletNode.port.onmessage = (event) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const float32Input = event.data;
                
                // Simple Downsampling (e.g. 48k -> 24k)
                // We need to resample from audioContext.sampleRate to TARGET_SAMPLE_RATE
                const ratio = audioContext.sampleRate / TARGET_SAMPLE_RATE;
                const newLength = Math.floor(float32Input.length / ratio);
                const int16 = new Int16Array(newLength);
                
                for (let i = 0; i < newLength; i++) {
                    // Linear interpolation or simple nearest neighbor?
                    // Nearest neighbor for simplicity/speed in JS (works 'ok' for voice)
                    const offset = Math.floor(i * ratio); 
                    const s = Math.max(-1, Math.min(1, float32Input[offset]));
                    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                if (int16.length > 0) {
                     const buffer = new Uint8Array(int16.buffer);
                     const binaryString = buffer.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                     const base64 = btoa(binaryString);
                     ws.send(JSON.stringify({ type: 'audio', data: base64 }));
                }
            }
        };
        
        log('🎤 Microphone connected and processing');
    } catch (err) {
        log('❌ Microphone error: ' + err.message);
    }
}

async function startVideoInput() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        videoPreview.srcObject = videoStream;
        
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        
        videoInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ctx.drawImage(videoPreview, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.5); 
                const base64 = dataUrl.split(',')[1];
                ws.send(JSON.stringify({ type: 'video', data: base64 }));
            }
        }, 1000); // 1fps
        
        log('👁️ Camera connected');
    } catch (err) {
        log('❌ Camera error: ' + err.message);
    }
}

function playAudioChunk(base64Data) {
    if (!audioContext) return;
    
    // Decode Base64 to PCM Int16
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    
    // Convert Int16 to Float32
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
        const s = int16[i];
        float32[i] = s < 0 ? s / 0x8000 : s / 0x7FFF;
    }
    
    // Create AudioBuffer
    const audioBuffer = audioContext.createBuffer(1, float32.length, TARGET_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);
    
    // Schedule Playback (Gapless)
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    const currentTime = audioContext.currentTime;
    if (nextStartTime < currentTime) {
        nextStartTime = currentTime;
    }
    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
}

btnConnect.onclick = async () => {
    // Explicitly resume/start audio context on user gesture
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
        log('🔊 AudioContext resumed');
    }

    ws = new WebSocket('ws://' + location.host);
    
    ws.onopen = async () => {
        log('⚡ Connected to Relay Server');
        updateStatus('connected');
        
        // Start Inputs
        await startAudioInput();
        await startVideoInput();
    };
    
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'audio') {
            statusDot.className = 'status-dot talking';
            playAudioChunk(msg.data);
            setTimeout(() => statusDot.className = 'status-dot connected', 200); 
        } else if (msg.type === 'interrupted') {
             log('🛑 Interrupted');
        }
    };
    
    ws.onclose = () => {
        log('🔌 Disconnected from Relay');
        updateStatus('disconnected');
        clearInterval(videoInterval);
    };
    
    ws.onerror = (err) => {
        log('❌ WebSocket Error');
    };
};

btnDisconnect.onclick = () => {
    if (ws) ws.close();
    if (audioContext) audioContext.close();
    if (videoStream) videoStream.getTracks().forEach(track => track.stop());
    clearInterval(videoInterval);
    statusDot.className = 'status-dot'; // Reset monitoring dot
};
