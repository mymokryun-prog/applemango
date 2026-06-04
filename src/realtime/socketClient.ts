/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { io, Socket } from 'socket.io-client';

let sharedSocket: Socket | null = null;

/** Same-origin in dev/prod (Express + Vite on one port) */
export function getLocationSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1000,
      timeout: 12000,
    });
  }
  return sharedSocket;
}

export function disconnectLocationSocket(): void {
  if (sharedSocket) {
    sharedSocket.removeAllListeners();
    sharedSocket.disconnect();
    sharedSocket = null;
  }
}
