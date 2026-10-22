// ============================================================
// Auto-patch expo-notifications for Expo Go
// Prevents "Cannot find native module 'ExpoTopicSubscriptionModule'" crash
// on Android devices running Expo Go
// ============================================================

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const jsPath = path.join(
  projectRoot,
  'node_modules/expo-notifications/build/TopicSubscriptionModule.android.js'
);

const tsPath = path.join(
  projectRoot,
  'node_modules/expo-notifications/src/TopicSubscriptionModule.android.ts'
);

const jsContent = `import { requireOptionalNativeModule } from 'expo-modules-core';

const fallback = {
    addListener: () => { },
    removeListeners: () => { },
    subscribeToTopicAsync: () => Promise.resolve(null),
    unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

let nativeModule = null;
try {
    nativeModule = requireOptionalNativeModule ? requireOptionalNativeModule('ExpoTopicSubscriptionModule') : null;
} catch (_) { }

export default nativeModule || fallback;
`;

const tsContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
import type { TopicSubscriptionModule } from './TopicSubscriptionModule.types';

const fallback: TopicSubscriptionModule = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

let nativeModule: TopicSubscriptionModule | null = null;
try {
  nativeModule = requireOptionalNativeModule ? requireOptionalNativeModule<TopicSubscriptionModule>('ExpoTopicSubscriptionModule') : null;
} catch (_) {}

export default nativeModule || fallback;
`;

try {
  if (fs.existsSync(jsPath)) {
    fs.writeFileSync(jsPath, jsContent, 'utf8');
    console.log('[patch_expo_notifications] Patched TopicSubscriptionModule.android.js');
  }
  if (fs.existsSync(tsPath)) {
    fs.writeFileSync(tsPath, tsContent, 'utf8');
    console.log('[patch_expo_notifications] Patched TopicSubscriptionModule.android.ts');
  }
} catch (err) {
  console.warn('[patch_expo_notifications] Skipped or failed:', err.message);
}
