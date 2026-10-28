/**
 * Barcode reading with the browser's built-in BarcodeDetector (Chrome on
 * Android, Safari on iOS 17+). Nothing is sent anywhere: codes are only
 * matched against the user's own record.
 */
import { cleanBarcode } from './db';

interface DetectedBarcode {
	rawValue: string;
	format: string;
}
interface Detector {
	detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
type DetectorClass = {
	new (options?: { formats: string[] }): Detector;
	getSupportedFormats?: () => Promise<string[]>;
};

// The retail codes printed on bottles.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

function detectorClass(): DetectorClass | null {
	return (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector ?? null;
}

export function barcodeSupported(): boolean {
	return detectorClass() !== null;
}

let detector: Promise<Detector | null> | null = null;
function getDetector(): Promise<Detector | null> {
	detector ??= (async () => {
		const D = detectorClass();
		if (!D) return null;
		try {
			const supported = (await D.getSupportedFormats?.()) ?? FORMATS;
			const formats = FORMATS.filter((f) => supported.includes(f));
			return formats.length ? new D({ formats }) : null;
		} catch {
			return null;
		}
	})();
	return detector;
}

/** The first retail barcode in an image or video frame, digits only. */
export async function readBarcode(source: ImageBitmapSource): Promise<string | null> {
	const d = await getDetector();
	if (!d) return null;
	try {
		const found = await d.detect(source);
		for (const b of found) {
			const code = cleanBarcode(b.rawValue);
			if (code.length >= 8) return code;
		}
	} catch {
		/* frame not ready, or an image the detector can't read */
	}
	return null;
}

/** A barcode from a photo blob (camera shot or gallery pick). */
export async function readBarcodeFromBlob(blob: Blob): Promise<string | null> {
	if (!barcodeSupported()) return null;
	try {
		const bitmap = await createImageBitmap(blob);
		try {
			return await readBarcode(bitmap);
		} finally {
			bitmap.close();
		}
	} catch {
		return null;
	}
}

/**
 * Watches a live video for barcodes, a few times a second. `onCode` fires when
 * the same code is read twice in a row, which filters out misreads. Returns a
 * function that stops watching.
 */
export function watchVideo(video: HTMLVideoElement, onCode: (code: string) => void): () => void {
	let stopped = false;
	let last = '';
	async function tick() {
		if (stopped) return;
		if (video.readyState >= 2 && video.videoWidth) {
			const code = await readBarcode(video);
			if (code && code === last) {
				last = '';
				if (!stopped) onCode(code);
			} else last = code ?? '';
		}
		if (!stopped) setTimeout(tick, 250);
	}
	if (barcodeSupported()) tick();
	return () => {
		stopped = true;
	};
}

/** "088004021473" → "0 88004 02147 3", the way it's printed under the bars. */
export function formatBarcode(code: string): string {
	if (code.length === 12) return `${code[0]} ${code.slice(1, 6)} ${code.slice(6, 11)} ${code[11]}`;
	if (code.length === 13) return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`;
	return code;
}
