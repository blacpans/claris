declare module 'node-record-lpcm16' {
	interface RecordOptions {
		sampleRate?: number;
		threshold?: number;
		thresholdStart?: number | null;
		thresholdEnd?: number | null;
		silence?: string;
		verbose?: boolean;
		recordProgram?: string;
		recorder?: string;
		device?: string | null;
		channels?: number;
	}

	interface Recorder {
		start(): Recorder;
		stop(): void;
		pause(): void;
		resume(): void;
		stream(): NodeJS.ReadableStream;
	}

	function record(options?: RecordOptions): Recorder;

	export default {
		record,
	};
}
