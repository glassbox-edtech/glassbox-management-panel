// ==========================================
// 🔔 GLASSBOX ADMIN SERVICE WORKER
// Handles background push notifications and quick actions
// ==========================================

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

async function getConfig(key) {
    const db = await getDb();
    return new Promise((resolve) => {
        const tx = db.transaction('config', 'readonly');
        const store = tx.objectStore('config');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
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
        data: data, // Stores the requestId and target for the button clicks
        actions: [
            { action: 'approve', title: '✅ Approve' },
            { action: 'deny', title: '❌ Deny' }
        ],
        requireInteraction: true // Keeps the notification open until clicked
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// 4. Handle Quick Action button clicks
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Instantly close the popup

    const action = event.action;
    const data = event.notification.data;

    // If they just clicked the body of the notification, open the dashboard
    if (!action) {
        // 🎯 FIX: Use self.registration.scope instead of '/' to support GitHub pages paths
        event.waitUntil(clients.openWindow(self.registration.scope));
        return;
    }

    // If they clicked Approve or Deny, fire off the API request!
    if (action === 'approve' || action === 'deny') {
        event.waitUntil((async () => {
            try {
                const workerUrl = await getConfig('workerUrl');
                const adminSecret = await getConfig('adminSecret');

                if (!workerUrl || !adminSecret) {
                    console.error("Missing credentials in SW. Cannot perform quick action.");
                    return;
                }

                // Fire the exact same POST request the dashboard uses
                await fetch(`${workerUrl}/api/admin/filter/resolve`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${adminSecret}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        requestId: data.requestId,
                        action: action,
                        target: data.target,
                        matchType: data.matchType || 'domain'
                    })
                });
                
                console.log(`Successfully executed quick action: ${action}`);
            } catch (err) {
                console.error("Quick Action failed:", err);
            }
        })());
    }
});