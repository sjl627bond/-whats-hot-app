(function initialiseObservability(windowObject) {
  'use strict';
  const queue = [];
  function safeMessage(value) {
    return String(value || 'Unknown client error').replace(/[\w.+-]+@[\w.-]+/g, '[email]').replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 300);
  }
  function record(kind, value) {
    const entry = { kind, message: safeMessage(value?.message || value), route: windowObject.location.hash.slice(0, 100), occurred_at: new Date().toISOString() };
    queue.push(entry); if (queue.length > 20) queue.shift();
    windowObject.dispatchEvent(new CustomEvent('gohott:client-error', { detail: entry }));
  }
  windowObject.addEventListener('error', (event) => record('error', event.error || event.message));
  windowObject.addEventListener('unhandledrejection', (event) => record('unhandledrejection', event.reason));
  windowObject.GoHottObservability = Object.freeze({ record, snapshot: () => queue.map((entry) => ({ ...entry })) });
}(window));
