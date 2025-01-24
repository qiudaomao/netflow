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
        const ip_dns = {}
        // const ips = new Set(flows.map(flow => flow.ipv4_src_addr));
        return Array.from(ips).filter(ip => {
            return isLocalIP(ip)
        }).sort().map(ip => {
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
        return ip && (ip.startsWith('192.168.111.') || ip.startsWith('192.168.23.'));
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
                };
            }
            merged[key].in_bytes += flow.in_bytes;
        }
        for (const flow of flows) {
            let key = `${flow.ipv4_dst_addr}:${flow.l4_dst_port}=>${flow.ipv4_src_addr}:${flow.l4_src_port}`;
            if (!merged[key]) continue;
            merged[key].out_bytes += flow.in_bytes;
        }
        return Object.values(merged);
    }, [flows]);

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
                default:
                    aValue = String(a[orderBy]);
                    bValue = String(b[orderBy]);
            }

            return order === 'asc' 
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });
    }, [mergedFlows, order, orderBy]);

    // Filter flows based on selected source IP (without port)
    const filteredFlows = React.useMemo(() => {
        if (!selectedSourceIP) return sortedFlows;
        return sortedFlows.filter(flow => flow.ipv4_src_addr === selectedSourceIP);
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
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <Box sx={{ p: 2 }}>
                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="Search in all fields..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </Box>
            </Grid>
            <Grid item xs={3}>
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
                                    <ListItemText primary={entry.dns ? `${entry.ip}[${entry.dns}]` : entry.ip} />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            </Grid>
            <Grid item xs={9}>
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
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
                                        In Bytes
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'out_bytes'}
                                        direction={orderBy === 'out_bytes' ? order : 'asc'}
                                        onClick={() => handleSort('out_bytes')}
                                    >
                                        Out Bytes
                                    </TableSortLabel>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {searchedFilteredFlows.map((flow, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        {`${flow.sourceDNS || ""}\n${flow.ipv4_src_addr}:${flow.l4_src_port}`}
                                    </TableCell>
                                    <TableCell>
                                        {`${flow.destDNS || ""}\n${flow.ipv4_dst_addr}:${flow.l4_dst_port}`}
                                    </TableCell>
                                    {/* <TableCell>
                                        {`${flow.postNATSourceIPv4Address}:${flow.postNAPTSourceTransportPort}`}
                                    </TableCell>
                                    <TableCell>
                                        {`${flow.postNATDestinationIPv4Address}:${flow.postNAPTDestinationTransportPort}`}
                                    </TableCell> */}
                                    <TableCell>{getProtocolName(flow.protocol)}</TableCell>
                                    <TableCell>{flow.in_bytes}</TableCell>
                                    <TableCell>{flow.out_bytes}</TableCell>
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