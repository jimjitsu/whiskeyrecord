/**
 * Photos taken on the camera screen, handed to the new-record form.
 * Kept in memory only; the form stores them in IndexedDB when it opens.
 */
export const pendingPhotos = $state<{ blobs: Blob[] }>({ blobs: [] });

export function takePendingPhotos(): Blob[] {
	const blobs = pendingPhotos.blobs;
	pendingPhotos.blobs = [];
	return blobs;
}
