// ==========================================
// 🔔 GLASSBOX ADMIN SERVICE WORKER
// Handles background push notifications and secure routing
// ==========================================

const DEBUG_MODE = false; 

// 1. Minimal IndexedDB wrapper to securely store credentials across browser restarts
function getDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('glassbox-sw-db', 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('config');
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e);
    });
}

// 2. Listen for messages from the open admin.html dashboard to save the login info
self.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'SET_CREDENTIALS') {
        const db = await getDb();
        const tx = db.transaction('config', 'readwrite');
        const store = tx.objectStore('config');
        store.put(event.data.workerUrl, 'workerUrl');
        store.put(event.data.adminSecret, 'adminSecret');
    }
});

// 3. Listen for incoming Web Push Notifications from Cloudflare
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : {};
    
    const title = "New Unblock Request";
    const options = {
        body: `URL: ${data.url}\nReason: ${data.reason}`,
        icon: 'https://cdn-icons-png.flaticon.com/512/2040/2040504.png', // Placeholder shield icon
        badge: 'https://cdn-icons-png.flaticon.com/512/2040/2040504.png',
        tag: data.requestId ? `req-${data.requestId}` : 'new-req', 
        data: data, 
        
        // 🎯 THE FIX: Action buttons removed to prevent Android Intent hijacking bugs.
        // Tapping the notification will safely route the admin to the dashboard instead.
        
        requireInteraction: true 
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// 4. Handle Notification clicks
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Instantly close the popup

    // Always securely open the dashboard to prevent OS-level button glitches
    event.waitUntil(clients.openWindow(self.registration.scope));
});