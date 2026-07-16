import { Injectable } from '@angular/core';

/**
 * Saves a blob to the user's downloads.
 *
 * A service rather than a bare function so components can be tested without a real download
 * firing: this is the one part of an export that touches the DOM and the filesystem.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    // Without this the blob is held for the lifetime of the document — a few exports of a
    // 20-course PDF and the tab is sitting on tens of MB it can never reclaim.
    URL.revokeObjectURL(url);
  }
}
