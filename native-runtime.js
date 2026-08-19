(function initialiseNativeRuntime(windowObject) {
  'use strict';

  const capacitor = windowObject.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  const plugins = capacitor?.Plugins || {};

  function plugin(name) {
    if (!isNative || !plugins[name]) throw new Error(`${name} is unavailable on this device.`);
    return plugins[name];
  }

  async function pickPhoto(source) {
    const camera = plugin('Camera');
    const options = {
      quality: 82,
      targetWidth: 1600,
      targetHeight: 1600,
      correctOrientation: true,
    };
    const result = source === 'camera'
      ? await camera.takePhoto(options)
      : (await camera.chooseFromGallery({ ...options, mediaType: 0, allowMultipleSelection: false, limit: 1 })).results?.[0];
    if (!result?.webPath) throw new Error('The selected photo could not be read.');
    const response = await fetch(result.webPath);
    if (!response.ok) throw new Error('The selected photo could not be read.');
    const blob = await response.blob();
    const extension = String(result.format || blob.type.split('/')[1] || 'jpeg').replace('jpg', 'jpeg');
    return new File([blob], `live-look-${Date.now()}.${extension === 'jpeg' ? 'jpg' : extension}`, { type: blob.type || `image/${extension}` });
  }

  async function requestPosition() {
    const geolocation = plugin('Geolocation');
    const permission = await geolocation.checkPermissions();
    if (permission.location !== 'granted') {
      const requested = await geolocation.requestPermissions({ permissions: ['location'] });
      if (requested.location !== 'granted') throw Object.assign(new Error('Location permission was not granted.'), { code: 1 });
    }
    const position = await geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
  }

  async function requestPushPermission() {
    const push = plugin('PushNotifications');
    let permission = await push.checkPermissions();
    if (permission.receive === 'prompt') permission = await push.requestPermissions();
    if (permission.receive !== 'granted') return { status: 'denied' };
    await push.register();
    return { status: 'registered-locally', backendRequired: true };
  }

  async function nativeShare(payload) {
    await plugin('Share').share(payload);
    return 'shared';
  }

  function normaliseDeepLink(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      if (!parts.length && url.protocol !== 'https:') parts.push(url.hostname);
      else if (url.protocol !== 'https:' && ['venue', 'profile', 'live-look', 'plan'].includes(url.hostname)) parts.unshift(url.hostname);
      const [type, id] = parts;
      if (!['venue', 'profile', 'live-look', 'plan'].includes(type) || !/^[a-zA-Z0-9-]{1,64}$/.test(id || '')) return null;
      return `#share/${type}/${id}`;
    } catch { return null; }
  }

  function installNativeListeners() {
    if (!isNative || !plugins.App) return;
    plugins.App.addListener('appUrlOpen', ({ url }) => {
      const hash = normaliseDeepLink(url);
      if (hash) windowObject.location.hash = hash;
    });
    plugins.App.addListener('appStateChange', ({ isActive }) => {
      windowObject.dispatchEvent(new CustomEvent('gohott:native-app-state', { detail: { isActive } }));
    });
  }

  installNativeListeners();
  windowObject.GoHottNative = Object.freeze({ isNative, pickPhoto, requestPosition, requestPushPermission, nativeShare, normaliseDeepLink });
}(window));
