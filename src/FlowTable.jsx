import React, { useState, useEffect } from 'react';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Paper,
    TableSortLabel,
    Grid,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Typography,
    TextField,
    Box
} from '@mui/material';
import io from 'socket.io-client';

/* flow format
{
  "last_switched": 779375290,
  "first_switched": 779315180,
  "in_pkts": 27,
  "in_bytes": 7108,
  "input_snmp": 17,
  "output_snmp": 12,
  "ipv4_src_addr": "111.29.57.93",
  "ipv4_dst_addr": "192.168.10.172",
  "protocol": 6,
  "src_tos": 4,
  "l4_src_port": 30087,
  "l4_dst_port": 55236,
  "ipv4_next_hop": "0.0.0.0",
  "dst_mask": 0,
  "src_mask": 0,
  "tcp_flags": 18,
  "sampling_interval": 0,
  "sampling_algorithm": 1,
  "in_dst_mac": "bc2411d662fb",
  "in_src_mac": "bc2411d662fb",
  "out_dst_mac": "2c15e12f3cc0",
  "out_src_mac": "8ebe37d30f74",
  "postNATSourceIPv4Address": "111.29.57.93",
  "postNATDestinationIPv4Address": "10.10.10.3",
  "postNAPTSourceTransportPort": 30087,
  "postNAPTDestinationTransportPort": 55236,
  "fsId": 256
}
*/

// 添加格式化字节数的辅助函数
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FlowTable = () => {
    const [flows, setFlows] = useState([]);
    const [orderBy, setOrderBy] = useState('');
    const [order, setOrder] = useState('asc');
    const [selectedSourceIP, setSelectedSourceIP] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');  // Add this line
    const [dnsCache, setDnsCache] = useState({});

    useEffect(() => {
        const socket = io({
            path: '/socket.io'
        });
        // Add debug logging for all events
        /*
        socket.onAny((eventName, ...args) => {
            console.log('Received event:', eventName, args);
        });
        */
        socket.on('newFlow', (flow) => {
            setFlows(prevFlows => {
                const newFlows = [...prevFlows, flow];
                if (newFlows.length > 5000) {
                    return newFlows.slice(-5000);
                }
                return newFlows;
            });
        });
        socket.on('addDnsEntry', (entry) => {
            const {ip, domain} = entry
            // console.log(`add dns ${ip} ${domain}`)
            if (dnsCache[ip] === domain) return
            setDnsCache((old) => {
                return {
                    ...old,
                    [ip]: domain
                }
            });
        });

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const getProtocolName = (protocol) => {
        const protocols = {
            1: 'ICMP',
            6: 'TCP',
            17: 'UDP'
        };
        return protocols[protocol] || protocol;
    };

    // Get unique source IPs from flows (without ports)
    const uniqueSourceIPs = React.useMemo(() => {
        const ips = new Set(flows.map(flow => flow.ipv4_src_addr))
        // const ips = new Set(flows.map(flow => flow.ipv4_src_addr));
        return Array.from(ips).filter(ip => {
            return isLocalIP(ip)
        }).sort((a, b) => {
            // 将IP地址分割为数字数组并比较
            const aparts = a.split('.').map(Number);
            const bparts = b.split('.').map(Number);
            
            for(let i = 0; i < 4; i++) {
                if(aparts[i] !== bparts[i]) {
                    return aparts[i] - bparts[i];
                }
            }
            return 0;
        }).map(ip => {
            return {
                ip: ip,
                dns: dnsCache[ip] ?? ""
            }
        });
    }, [flows]);

    const handleSort = (property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    function isLocalIP(ip) {
        return ip && (ip.startsWith('192.168.') || ip.startsWith('192.168.'));
    }
    
    function wrapIP(ip) {
        return dnsCache[ip] ? `${ip}[${dnsCache[ip]}]` : ip
    }

    // merge flows, ignore srcPort, merge than if srcIP, dstIP and dstPort are same, also added the bytes together
    const mergedIOFlows = React.useMemo(() => {
        const merged = {};
        // first merge ipv4_src_addr is local ip
        for (const flow of flows) {
            let key = `${flow.ipv4_src_addr}:${flow.l4_src_port}=>${flow.ipv4_dst_addr}:${flow.l4_dst_port}`;
            // if (!isLocalIP(flow.ipv4_src_addr)) {
                // continue
            // }
            if (!merged[key]) {
                if (!flow["ipv4_src_addr"]) continue
                merged[key] = {
                    ...flow,
                    in_bytes: 0,
                    out_bytes: 0,
                    sourceDNS: dnsCache[flow.ipv4_src_addr] ?? "",
                    destDNS: dnsCache[flow.ipv4_dst_addr] ?? "",
                    merged: false
                };
                if (flow.first_switched < merged[key].first_switched) {
                    merged[key].first_switched = flow.first_switched
                }
                if (flow.last_switched > merged[key].last_switched) {
                    merged[key].last_switched = flow.last_switched
                }
            }
            merged[key].in_bytes += flow.in_bytes;
        }
        for (const flow of flows) {
            let key = `${flow.postNATDestinationIPv4Address}:${flow.postNAPTDestinationTransportPort}=>${flow.postNATSourceIPv4Address}:${flow.postNAPTSourceTransportPort}`;
            if (merged[key]) {
                merged[key].out_bytes += flow.in_bytes;
                merged[key].merged = true
            } 
        }
        return Object.values(merged);
    }, [flows]);
    
    const mergedIPBytes = React.useMemo(() => {
        let mergedBytes = {}
        for (const ip of uniqueSourceIPs) {
            const key = `${ip.ip}`
            if (!mergedBytes[key]) {
                mergedBytes[key] = {
                    ip: ip,
                    in_bytes: 0,
                    out_bytes: 0
                }
            }
            for (const flow of flows) {
                if (flow.ipv4_src_addr === ip.ip) {
                    mergedBytes[key].in_bytes += flow.in_bytes
                }
                if (flow.postNATDestinationIPv4Address === ip.ip) {
                    mergedBytes[key].out_bytes += flow.in_bytes
                }
            }
        }
        return mergedBytes
    }, [mergedIOFlows]);

    const mergedFlows = React.useMemo(() => {
        const merged = {};
        for (const flow of mergedIOFlows) {
            // ignore l4_src_port
            const key = `${flow.ipv4_src_addr}=>${flow.ipv4_dst_addr}:${flow.l4_dst_port}`;
            if (!merged[key]) {
                merged[key] = {
                    ...flow,
                    in_bytes: 0,
                    out_bytes: 0,
                };
            }
            merged[key].in_bytes += flow.in_bytes;
            merged[key].out_bytes += flow.out_bytes;
        }
        return Object.values(merged);
    }, [mergedIOFlows]);

    const sortedFlows = React.useMemo(() => {
        if (!orderBy) return mergedFlows;

        return [...mergedFlows].sort((a, b) => {
            let aValue, bValue;
            
            switch(orderBy) {
                case 'sourceIP':
                    aValue = `${a.ipv4_src_addr}`;
                    bValue = `${b.ipv4_src_addr}`;
                    break;
                case 'destIP':
                    aValue = `${a.ipv4_dst_addr}:${a.l4_dst_port}`;
                    bValue = `${b.ipv4_dst_addr}:${b.l4_dst_port}`;
                    break;
                case 'postNATSourceIP':
                    aValue = `${a.postNATSourceIPv4Address}:${a.postNAPTSourceTransportPort}`;
                    bValue = `${b.postNATSourceIPv4Address}:${b.postNAPTSourceTransportPort}`;
                    break;
                case 'postNATDestIP':
                    aValue = `${a.postNATDestinationIPv4Address}:${a.postNAPTDestinationTransportPort}`;
                    bValue = `${b.postNATDestinationIPv4Address}:${b.postNAPTDestinationTransportPort}`;
                    break;
                case 'in_bytes':
                    return order === 'asc' ? a.in_bytes - b.in_bytes : b.in_bytes - a.in_bytes;
                case 'out_bytes':
                    return order === 'asc' ? a.out_bytes - b.out_bytes : b.out_bytes - a.out_bytes;
                case 'last_switched':
                    return order === 'asc'? a.last_switched - b.last_switched : b.last_switched - a.last_switched;
                case 'first_switched':
                    return order === 'asc'? a.first_switched - b.first_switched : b.first_switched - a.first_switched;
                default:
                    aValue = String(a[orderBy]);
                    bValue = String(b[orderBy]);
            }

            return order === 'asc' 
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });
    }, [mergedFlows, order, orderBy]);
    // }, [flows, order, orderBy]);

    // Filter flows based on selected source IP (without port)
    const filteredFlows = React.useMemo(() => {
        if (!selectedSourceIP) return sortedFlows;
        return sortedFlows.filter(flow => 
            flow.ipv4_src_addr === selectedSourceIP
            // || (flow.postNATDestinationIPv4Address === selectedSourceIP && !flow.merged)
            // || flow.ipv4_dst_addr === selectedSourceIP
            // || flow.postNATSourceIPv4Address === selectedSourceIP
            // || flow.postNATDestinationIPv4Address === selectedSourceIP
        );
    }, [sortedFlows, selectedSourceIP]);

    // Add this before filteredFlows
    const searchedFilteredFlows = React.useMemo(() => {
        if (!searchQuery) return filteredFlows;
        const query = searchQuery.toLowerCase();
        return filteredFlows.filter(flow => {
            return (
                (flow.sourceDNS || '').toLowerCase().includes(query) ||
                (flow.destDNS || '').toLowerCase().includes(query) ||
                (flow.ipv4_src_addr && flow.ipv4_src_addr.toLowerCase().includes(query)) ||
                (flow.ipv4_dst_addr && flow.ipv4_dst_addr.toLowerCase().includes(query)) ||
                (flow.postNATSourceIPv4Address && flow.postNATSourceIPv4Address.toLowerCase().includes(query)) ||
                (flow.postNATDestinationIPv4Address && flow.postNATDestinationIPv4Address.toLowerCase().includes(query)) ||
                String(flow.l4_src_port).includes(query) ||
                String(flow.l4_dst_port).includes(query) ||
                String(flow.postNAPTSourceTransportPort).includes(query) ||
                String(flow.postNAPTDestinationTransportPort).includes(query) ||
                (`${flow.protocol && getProtocolName(flow.protocol)}`.toLowerCase().includes(query))
            );
        });
    }, [filteredFlows, searchQuery]);

    return (
        <Grid container spacing={1}>
            <Grid item xs={2}>
                <Paper sx={{ p: 2, maxHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
                    <Typography variant="h6" gutterBottom>
                        Source IPs
                    </Typography>
                    <List>
                        <ListItem disablePadding>
                            <ListItemButton 
                                selected={selectedSourceIP === null}
                                onClick={() => setSelectedSourceIP(null)}
                            >
                                <ListItemText primary="Show All" />
                            </ListItemButton>
                        </ListItem>
                        {uniqueSourceIPs.map((entry) => (
                            <ListItem key={entry.ip} disablePadding>
                                <ListItemButton 
                                    selected={selectedSourceIP === entry.ip}
                                    onClick={() => setSelectedSourceIP(entry.ip)}
                                >
                                    <ListItemText 
                                        primary={entry.ip}
                                        secondary={`${entry.dns} 🔺${formatBytes(mergedIPBytes[entry.ip].in_bytes ?? 0)} 🔻${formatBytes(mergedIPBytes[entry.ip].out_bytes ?? 0)}`}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </Grid>
            <Grid item xs={10}>
                <Box sx={{ p: 2 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="Search in all fields..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </Box>
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'first_switched'}
                                        direction={orderBy === 'first_switched' ? order : 'asc'}
                                        onClick={() => handleSort('first_switched')}
                                    >
                                        First Switched
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'last_switched'}
                                        direction={orderBy === 'last_switched' ? order : 'asc'}
                                        onClick={() => handleSort('last_switched')}
                                    >
                                        Last Switched
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'sourceIP'}
                                        direction={orderBy === 'sourceIP' ? order : 'asc'}
                                        onClick={() => handleSort('sourceIP')}
                                    >
                                        Source IP:Port
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'destIP'}
                                        direction={orderBy === 'destIP' ? order : 'asc'}
                                        onClick={() => handleSort('destIP')}
                                    >
                                        Destination IP:Port
                                    </TableSortLabel>
                                </TableCell>
                                {/* <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'postNATSourceIP'}
                                        direction={orderBy === 'postNATSourceIP' ? order : 'asc'}
                                        onClick={() => handleSort('postNATSourceIP')}
                                    >
                                        NAT Source IP:Port
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'postNATDestIP'}
                                        direction={orderBy === 'postNATDestIP' ? order : 'asc'}
                                        onClick={() => handleSort('postNATDestIP')}
                                    >
                                        NAT Destination IP:Port
                                    </TableSortLabel>
                                </TableCell> */}
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'protocol'}
                                        direction={orderBy === 'protocol' ? order : 'asc'}
                                        onClick={() => handleSort('protocol')}
                                    >
                                        Protocol
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'in_bytes'}
                                        direction={orderBy === 'in_bytes' ? order : 'asc'}
                                        onClick={() => handleSort('in_bytes')}
                                    >
                                        Upload
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'out_bytes'}
                                        direction={orderBy === 'out_bytes' ? order : 'asc'}
                                        onClick={() => handleSort('out_bytes')}
                                    >
                                        Download
                                    </TableSortLabel>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {searchedFilteredFlows.map((flow, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <>
                                            <div>{flow.first_switched|| ""}</div>
                                        </>
                                    </TableCell>
                                    <TableCell>
                                        <>
                                            <div>{flow.last_switched|| ""}</div>
                                        </>
                                    </TableCell>
                                    <TableCell>
                                        <>
                                            <div>{flow.sourceDNS || ""}</div>
                                            <div style={{ color: 'secondary.main' }}>{`${flow.ipv4_src_addr}:${flow.l4_src_port}`}</div>
                                        </>
                                    </TableCell>
                                    <TableCell>
                                        <>
                                            <div>{flow.destDNS || ""}</div>
                                            <div style={{ color: 'secondary.main' }}>{`${flow.ipv4_dst_addr}:${flow.l4_dst_port}`}</div>
                                        </>
                                    </TableCell>
                                    {/* <TableCell>
                                        {`${flow.postNATSourceIPv4Address}:${flow.postNAPTSourceTransportPort}`}
                                    </TableCell>
                                    <TableCell>
                                        {`${flow.postNATDestinationIPv4Address}:${flow.postNAPTDestinationTransportPort}`}
                                    </TableCell> */}
                                    <TableCell>{getProtocolName(flow.protocol)}</TableCell>
                                    <TableCell>{formatBytes(flow.in_bytes)}</TableCell>
                                    <TableCell>{formatBytes(flow.out_bytes)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Grid>
        </Grid>
    );
};

export default FlowTable;
