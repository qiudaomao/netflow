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

// RouterOS DNS cache configuration
const ROUTEROS_CONFIG = {
    host: '192.168.111.1',
    port: 80,
    username: 'admin',
    password: '061x09bg33',
    pollInterval: 5000 // 5 seconds
};

// DNS cache storage
const dnsCache = new Map();

// Poll RouterOS DNS cache
async function pollDNSCache() {
    try {
        const auth = Buffer.from(`${ROUTEROS_CONFIG.username}:${ROUTEROS_CONFIG.password}`).toString('base64');
        fetch(`http://${ROUTEROS_CONFIG.host}:${ROUTEROS_CONFIG.port}/rest/ip/dns/cache`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        }).then((response)=>{
            response.json().then((dnsData)=> {
                // Update DNS cache
                dnsData.forEach(entry => {
                    if (entry.type === 'A') {
                        dnsCache.set(entry.data, entry.name);
                    }
                });
            })
        });
    } catch (error) {
        console.error('Failed to poll DNS cache:', error);
    }
}

// Poll RouterOS DNS cache
async function pollDHCPCache() {
    try {
        const auth = Buffer.from(`${ROUTEROS_CONFIG.username}:${ROUTEROS_CONFIG.password}`).toString('base64');
        fetch(`http://${ROUTEROS_CONFIG.host}:${ROUTEROS_CONFIG.port}/rest/ip/dhcp-server/lease`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        }).then((response)=>{
            response.json().then((dhcpData)=> {
                // Update DNS cache
                dhcpData.forEach(entry => {
                    dnsCache.set(entry["active-address"], entry["host-name"])
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

// Store last 1000 flows
const flows = [];
const MAX_FLOWS = 1000;

// NetFlow collector
Collector(function(flow) {
    flow.flows.forEach(f => {
        const flowData = {
            sourceIP: `${f.ipv4_src_addr}:${f.l4_src_port}`,
            destIP: `${f.ipv4_dst_addr}:${f.l4_dst_port}`,
            protocol: f.protocol,
            bytes: f.in_bytes,
            sourceDNS: dnsCache.get(f.ipv4_src_addr) || '',
            destDNS: dnsCache.get(f.ipv4_dst_addr) || '',
            ...f
        };
        //console.log(`Received flow: ${JSON.stringify(f, null, 2)}`)
        //console.log(`Received flow: ${JSON.stringify(flowData)}`)
        
        flows.unshift(flowData);
        if (flows.length > MAX_FLOWS) {
            flows.pop();
        }
        
        io.emit('newFlow', flowData);
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

http.listen(8080, () => {
    console.log('Web server listening on port 8080');
});
