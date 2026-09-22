// Firebase Cloud Messaging Service Worker for SHINE Relief Trust Malawi
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  projectId: 'wise-cabinet-6mn89',
  appId: '1:552589784282:web:454531bcbe3b7adcfd61e3',
  apiKey: 'AIzaSyBiqMyhHhOJBwnJQEq1TDCLC4jV2OyMb5c',
  authDomain: 'wise-cabinet-6mn89.firebaseapp.com',
  messagingSenderId: '552589784282',
});

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);
  const notificationTitle = payload.notification?.title || 'SHINE Relief Trust Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'New case management update.',
    icon: '/shine-logo.png',
    badge: '/shine-logo.png',
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Notification click handler to open application window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
