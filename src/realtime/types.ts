/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GpsStatus =
  | 'idle'
  | 'requesting'
  | 'watching'
  | 'degraded'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface LocationUpdatedPayload {
  friendId: string;
  lat: number;
  lng: number;
  statusMsg?: string;
  speed?: number;
  heading?: string;
  battery?: number;
  heartRate?: number;
  route?: Array<[number, number]>;
  routeIndex?: number;
  updatedAt?: string;
  isOnline?: boolean;
  accuracy?: number;
  source?: 'gps' | 'manual';
}
