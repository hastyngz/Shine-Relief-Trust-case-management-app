// Firebase Cloud Messaging Service Worker for SHINE Relief Trust Malawi
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  projectId: 'shine-relief-trust-cms',
  appId: '1:866167287276:web:df7ade4723d464ec2e64c9',
  apiKey: 'AIzaSyBSovgPDgjHokLIQd4kv8FGBe1vcdzpnGU',
  authDomain: 'shine-relief-trust-cms.firebaseapp.com',
  storageBucket: 'shine-relief-trust-cms.firebasestorage.app',
  messagingSenderId: '866167287276',
  measurementId: 'G-F8VFCH6X8C',
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
