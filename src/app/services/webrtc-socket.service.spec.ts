import { TestBed } from '@angular/core/testing';

import { WebRTCSocketService } from './webrtc-socket.service';

describe('WebRTCSocketService', () => {
  let service: WebRTCSocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebRTCSocketService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
