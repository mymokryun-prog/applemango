# 애플망고톡 네이티브 앱 전환 가이드 (Capacitor)

작성일: 2026-06_11

## 결론 (한 줄)

이 프로젝트는 Capacitor 골격이 적용되어 있으며, 아래 체크리스트를 순서대로 실행하면
백그라운드 위치 추적이 가능한 Android/iOS 네이티브 앱을 빌드해 스토어 심사에 제출할 수 있다.

## 0. 사전 준비물

| 항목 | Android | iOS |
|---|---|---|
| 개발 도구 | Android Studio (최신) | Xcode 15+ (macOS 필수) |
| 개발자 계정 | Google Play Console (1회 $25) | Apple Developer ($99/년) |
| 운영 서버 | Railway 배포 도메인 (HTTPS) | 동일 |

## 1. 운영 서버 주소 설정 (필수 — 가장 먼저)

`capacitor.config.json`의 `server.url`을 실제 배포 도메인으로 교체한다.
네이티브 앱은 이 주소의 웹앱을 로드하므로, 교체하지 않으면 앱이 동작하지 않는다.

```json
"server": { "url": "https://<실제-railway-도메인>", "cleartext": false }
```

## 2. 의존성 설치 및 플랫폼 추가 (내 PC에서 실행)

```bash
npm install
npm run build
npm run cap:add:android   # android/ 폴더 생성
npm run cap:sync          # 웹 빌드 → 네이티브 프로젝트 동기화
```

> 참고: Capacitor 7 + @capacitor-community/background-geolocation 1.2.x 조합을 사용한다.
> Capacitor 8은 이 플러그인과 백그라운드 진입 시 크래시 이슈가 보고되어 있어 메이저 업그레이드를 보류한다.

## 3. Android 권한 설정

`android/app/src/main/AndroidManifest.xml`의 `<manifest>` 레벨에 추가:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

## 4. iOS 권한 설정

`ios/App/App/Info.plist`에 추가:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>가족·친구와 실시간 위치를 공유하기 위해 위치 권한이 필요합니다.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>화면이 꺼져 있어도 가족 안심 기능(도착 알림·무활동 감지)이 동작하려면 항상 허용이 필요합니다.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```

## 5. 실기기 테스트 체크리스트

- [ ] 위치 권한 「항상 허용」 부여 후 화면을 끄고 10분 이동 → 다른 기기에서 위치 갱신 확인
- [ ] 안심 장소(집) 등록 → 출발/도착 푸시 수신 확인
- [ ] SOS 발신 → 다른 멤버 푸시 + tel:119 다이얼 화면 확인
- [ ] 비행기 모드에서 위치 이동 → 복귀 시 HTTP 폴백 전송 확인
- [ ] 24시간 배터리 소모율 측정 (목표: 일 5% 이하)

## 6. 스토어 심사 대비 메모

- 백그라운드 위치는 심사 시 사용 목적 증빙을 요구한다. 심사 노트에
  "가족 안심 위치 공유, 도착 알림, 무활동 감지"를 스크린샷과 함께 기재할 것.
- 개인정보처리방침 URL 필수(위치·심박 수집 명시).
- 한국 서비스: 방송통신위원회 위치기반서비스사업 신고 완료 후 출시할 것.
- 미성년자 사용: 만 14세 미만은 법정대리인 동의 절차 필요(온보딩에 추가 예정).

## 7. 코드 구조

- `capacitor.config.json` — 네이티브 래퍼 설정 (server.url 교체 필수)
- `src/native/backgroundLocation.ts` — 백그라운드 위치 브리지.
  네이티브에서는 Capacitor 플러그인 워처, 웹에서는 자동으로 기존 geolocation 경로 사용.
- `src/hooks/useRealtimeLocation.ts` — 네이티브 감지 시 백그라운드 워처 우선,
  소켓 끊김 시 HTTP(/api/friends/move) 폴백 전송.

## 핵심 요약 (3줄)

1. capacitor.config.json의 server.url 교체 → npm install → cap:add → 권한 추가 → 실기기 테스트 순서.
2. 백그라운드 위치는 코드 준비 완료 — 권한 설정과 스토어 심사 대응이 남은 작업이다.
3. Capacitor 8 업그레이드는 background-geolocation 플러그인 호환 확인 전까지 금지.
