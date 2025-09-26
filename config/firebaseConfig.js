(function injectFirebaseConfig() {
  const script = document.currentScript;
  if (!script) {
    console.error('Firebase configuration script must be loaded directly in the page.');
    return;
  }

  const firebaseConfig = {
    apiKey: script.dataset.firebaseApiKey || '',
    authDomain: script.dataset.firebaseAuthDomain || '',
    projectId: script.dataset.firebaseProjectId || '',
    storageBucket: script.dataset.firebaseStorageBucket || '',
    messagingSenderId: script.dataset.firebaseMessagingSenderId || '',
    appId: script.dataset.firebaseAppId || ''
  };

  const missingKeys = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    const message = `Firebase configuration is incomplete. Missing: ${missingKeys.join(', ')}`;
    console.error(message);
    throw new Error(message);
  }

  window.__FIREBASE_CONFIG__ = firebaseConfig;
})();
