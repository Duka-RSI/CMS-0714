import { TestBed } from '@angular/core/testing';

import { FileDownloadService } from './file-download.service';

describe('FileDownloadService', () => {
  let service: FileDownloadService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileDownloadService);
  });

  it('clicks a download link named after the file, and releases the object URL', () => {
    const link = document.createElement('a');
    spyOn(document, 'createElement').and.returnValue(link);
    spyOn(link, 'click');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake-url');
    const revoke = spyOn(URL, 'revokeObjectURL');

    service.save(new Blob(['%PDF']), 'courses-2.pdf');

    expect(link.download).toBe('courses-2.pdf');
    expect(link.href).toContain('blob:fake-url');
    expect(link.click).toHaveBeenCalled();
    // Not revoking leaks the blob for the lifetime of the tab.
    expect(revoke).toHaveBeenCalledWith('blob:fake-url');
  });
});
