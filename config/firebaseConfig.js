(function injectFirebaseConfig() {
  const firebaseConfig = {
  apiKey: "AIzaSyBEuFW_VQEx_smJUOxCsF0Jug_lnzUA2aw",
  authDomain: "offline-d2e68.firebaseapp.com",
  projectId: "offline-d2e68",
  storageBucket: "offline-d2e68.firebasestorage.app",
  messagingSenderId: "524684058670",
  appId: "1:524684058670:web:5141130aee53e059cc7fbf"
  };

  const normalize = (value) => (typeof value === 'string' ? value.trim() : value);
  const hasAllRequiredKeys = (config) =>
    !!config &&
    REQUIRED_KEYS.every((key) => {
      const value = normalize(config[key]);
      return value !== undefined && value !== null && value !== '';
    });

  const getMissingKeys = (config) =>
    REQUIRED_KEYS.filter((key) => {
      const value = config ? normalize(config[key]) : undefined;
      return value === undefined || value === null || value === '';
    });

  const script = document.currentScript;
  const existingConfig = window.__FIREBASE_CONFIG__;

  const candidateConfigs = [];

  if (existingConfig) {
    candidateConfigs.push(existingConfig);
  }

  if (window.__APP_FIREBASE_CONFIG__) {
    candidateConfigs.push(window.__APP_FIREBASE_CONFIG__);
  }

  const inlineConfigElement = document.getElementById('firebase-config');
  if (inlineConfigElement) {
    try {
      const parsed = JSON.parse(inlineConfigElement.textContent || '{}');
      candidateConfigs.push(parsed);
    } catch (error) {
      console.error('Failed to parse inline Firebase configuration JSON.', error);
      window.__FIREBASE_CONFIG_ERROR__ = 'Não foi possível interpretar a configuração inline do Firebase. Verifique o JSON informado.';
    }
  }

  if (script) {
    const datasetConfig = {
      apiKey: normalize(script.dataset.firebaseApiKey),
      authDomain: normalize(script.dataset.firebaseAuthDomain),
      projectId: normalize(script.dataset.firebaseProjectId),
      storageBucket: normalize(script.dataset.firebaseStorageBucket),
      messagingSenderId: normalize(script.dataset.firebaseMessagingSenderId),
      appId: normalize(script.dataset.firebaseAppId)
    };
    candidateConfigs.push(datasetConfig);
  }

  const resolvedConfig = candidateConfigs.find((config) => hasAllRequiredKeys(config));

  if (resolvedConfig) {
    window.__FIREBASE_CONFIG__ = resolvedConfig;
    window.__FIREBASE_CONFIG_ERROR__ = undefined;
    return;
  }

  const lastCandidate = candidateConfigs[candidateConfigs.length - 1];
  const missingKeys = getMissingKeys(lastCandidate);

  let message;
  if (!candidateConfigs.length) {
    message = 'Firebase configuration was not provided. Informe as credenciais via data-attributes, JSON inline ou variável global __APP_FIREBASE_CONFIG__.';
  } else if (missingKeys.length > 0) {
    message = `Firebase configuration is incomplete. Missing: ${missingKeys.join(', ')}.`;
  } else {
    message = 'Firebase configuration could not be resolved.';
  }

  console.error(message);
  window.__FIREBASE_CONFIG_ERROR__ = message;
})();
