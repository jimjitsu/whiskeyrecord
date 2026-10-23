const MAX_EDGE = 1200;
const QUALITY = 0.85;

/** Shrinks a photo to ~1200px on its long edge as JPEG (about 200 KB) before storing. */
export async function resizeImage(source: Blob | HTMLCanvasElement): Promise<Blob> {
	const bitmap =
		source instanceof HTMLCanvasElement
			? source
			: await createImageBitmap(source, { imageOrientation: 'from-image' });
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	if ('close' in bitmap) bitmap.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))),
			'image/jpeg',
			QUALITY
		)
	);
}
