/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BIZ-CORE-8 / 네이티브 전환: Capacitor 백그라운드 위치 브리지
 *
 * - 컴파일 타임에 @capacitor/* 패키지를 import하지 않습니다.
 *   (웹 빌드는 Capacitor 미설치 환경에서도 그대로 동작해야 하므로
 *    런타임 전역 객체(window.Capacitor)로만 감지합니다)
 * - 네이티브 앱(Capacitor 래핑)에서 실행되면 화면이 꺼져도 위치를 계속 수집하는
 *   @capacitor-community/background-geolocation 플러그인 워처를 사용합니다.
 * - 웹(PWA)에서는 null을 반환하여 기존 navigator.geolocation 경로를 그대로 사용합니다.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

interface NativeLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number | null;
  time?: number | null;
}

interface NativeWatcherError {
  code?: string;
  message?: string;
}

/** Capacitor 네이티브 런타임 위에서 실행 중인지 감지 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

/**
 * 백그라운드 위치 워처 시작.
 * @returns 정리(cleanup) 함수. 네이티브 환경이 아니거나 실패하면 null —
 *          호출 측은 null일 때 웹 geolocation 경로로 폴백해야 합니다.
 */
export async function startNativeBackgroundWatch(
  onPosition: (lat: number, lng: number, accuracy?: number) => void,
  onError: (message: string) => void
): Promise<(() => void) | null> {
  if (!isNativeApp()) return null;

  try {
    const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

    const watcherId: string = await BackgroundGeolocation.addWatcher(
      {
        // Android 포그라운드 서비스 알림 문구(법적 고지 겸 사용자 안내)
        backgroundTitle: '애플망고톡 위치 공유 중 🥭',
        backgroundMessage: '가족 안심을 위해 위치를 공유하고 있습니다. 앱에서 끌 수 있어요.',
        requestPermissions: true,
        stale: false,
        // 25m 이상 이동 시에만 콜백 — 배터리 절약(위치 앱 이탈 1순위 원인 방어)
        distanceFilter: 25,
      },
      (location?: NativeLocation, error?: NativeWatcherError) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            onError(
              '백그라운드 위치 권한이 필요합니다. 설정 → 애플리케이션 → 애플망고톡 → 위치 → 「항상 허용」으로 변경해 주세요.'
            );
          } else {
            onError(error.message || '네이티브 위치 수집 오류가 발생했습니다.');
          }
          return;
        }
        if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
          onPosition(location.latitude, location.longitude, location.accuracy);
        }
      }
    );

    return () => {
      try {
        BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
      } catch {
        /* 무시 */
      }
    };
  } catch (e) {
    console.error('Native background watch start failed:', e);
    return null;
  }
}
