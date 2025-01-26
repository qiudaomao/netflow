import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fetch from 'node-fetch';
import Collector from 'node-netflowv9';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';

const app = express();
const http = createServer(app);
const io = new Server(http);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routerOsUrl = process.argv[2] || 'http://admin:password@192.168.111.1:80';
const url = new URL(routerOsUrl);

// RouterOS DNS cache configuration
const ROUTEROS_CONFIG = {
    host: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    username: url.username,
    password: url.password,
    protocol: url.protocol.replace(':', ''),
    pollInterval: 5000 // 5 seconds
};

console.log(`routeros ${JSON.stringify(ROUTEROS_CONFIG, null, 2)}`)

/*
// RouterOS DNS cache configuration
const ROUTEROS_CONFIG = {
    host: '192.168.111.1',
    port: 80,
    username: 'admin',
    password: '061x09bg33',
    pollInterval: 5000 // 5 seconds
};
*/

// DNS cache storage
const dnsCache = new Map();

function addCache(ip, domain) {
    io.emit('addDnsEntry', {ip, domain});
}

// Poll RouterOS DNS cache
async function pollDNSCache() {
    try {
        const auth = Buffer.from(`${ROUTEROS_CONFIG.username}:${ROUTEROS_CONFIG.password}`).toString('base64');
        fetch(`${ROUTEROS_CONFIG.protocol}://${ROUTEROS_CONFIG.host}:${ROUTEROS_CONFIG.port}/rest/ip/dns/cache`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        }).then((response)=>{
            response.json().then((dnsData)=> {
                // Update DNS cache
                dnsData.forEach(entry => {
                    if (entry.type === 'A') {
                        if (!dnsData[entry.data]) {
                            //console.log(`add dnsCache ${entry.data} ${entry.name}`)
                        }
                        dnsCache.set(entry.data, entry.name);
                        addCache && addCache(entry.data, entry.name)
                    }
                });
            })
        });
    } catch (error) {
        console.error('Failed to poll DNS cache:', error);
    }
}

// Poll RouterOS DNS cache
function pollDHCPCache() {
    try {
        const auth = Buffer.from(`${ROUTEROS_CONFIG.username}:${ROUTEROS_CONFIG.password}`).toString('base64');
        fetch(`${ROUTEROS_CONFIG.protocol}://${ROUTEROS_CONFIG.host}:${ROUTEROS_CONFIG.port}/rest/ip/dhcp-server/lease`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        }).then((response)=>{
            response.json().then((dhcpData)=> {
                // Update DNS cache
                dhcpData.forEach(entry => {
                    const ip = entry["active-address"]
                    const domain = entry["host-name"]
                    if (!ip || !domain) return
                    if (!dnsCache[ip]) {
                        //console.log(`add dns dhcp ${ip} ${domain}`)
                    }
                    dnsCache.set(ip, domain)
                    addCache && addCache(ip, domain)
                });
            })
        });
    } catch (error) {
        console.error('Failed to poll DHCP cache:', error);
    }
}

// Start DNS polling
setInterval(pollDNSCache, ROUTEROS_CONFIG.pollInterval);
setInterval(pollDHCPCache, ROUTEROS_CONFIG.pollInterval);
pollDNSCache(); // Initial poll
pollDHCPCache();

// Add DNS cache endpoint
app.get('/dns-cache', (req, res) => {
    const cacheArray = Array.from(dnsCache.entries()).map(([ip, name]) => ({
        ip,
        name
    }));
    res.json(cacheArray);
});

// Serve static files
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
} else {
    app.use(express.static(path.join(__dirname, 'public')));
}

// NetFlow collector
Collector(function(flow) {
    flow.flows.forEach(f => {
        // console.log(JSON.stringify(f, null, 1))
        io.emit('newFlow', f);
    });
}).listen(3000);

// Serve initial page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve flow data
app.get('/flows', (req, res) => {
    res.json(flows);
});

http.listen(8088, () => {
    console.log('Web server listening on port 8088');
});
