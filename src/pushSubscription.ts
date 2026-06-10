/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const getPushSubscription = async (registration: ServiceWorkerRegistration): Promise<PushSubscription | null> => {
  if (!registration.pushManager) {
    return null;
  }
  return await registration.pushManager.getSubscription();
};

export const subscribeToPushManager = async (
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription> => {
  return await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
};

export const unsubscribeFromPushManager = async (registration: ServiceWorkerRegistration): Promise<boolean> => {
  const subscription = await getPushSubscription(registration);
  if (!subscription) {
    return false;
  }
  return await subscription.unsubscribe();
};
