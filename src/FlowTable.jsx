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
    Typography
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

    useEffect(() => {
        const socket = io({
            path: '/socket.io'
        });
        // Add debug logging for all events
        socket.onAny((eventName, ...args) => {
            console.log('Received event:', eventName, args);
        });
        socket.on('newFlow', (flow) => {
            // 更新流量数据，保持最新的1000条记录
            setFlows(prevFlows => {
                const newFlows = [...prevFlows, flow];
                if (newFlows.length > 1000) {
                    return newFlows.slice(-1000);
                }
                return newFlows;
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
        for (const flow of flows) {
            ip_dns[flow.ipv4_src_addr] = flow.sourceDNS
        }
        // const ips = new Set(flows.map(flow => flow.ipv4_src_addr));
        return Array.from(ips).filter(ip => {
            // only check for 192.168.111.0/24 and 192.168.23.0/24
            return ip && (ip.startsWith('192.168.111.') || ip.startsWith('192.168.23.'))
        }).sort().map(ip => {
            return {
                ip: ip,
                dns: ip_dns[ip]
            }
        });
    }, [flows]);

    const handleSort = (property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedFlows = React.useMemo(() => {
        if (!orderBy) return flows;

        return [...flows].sort((a, b) => {
            let aValue, bValue;
            
            switch(orderBy) {
                case 'sourceIP':
                    aValue = `${a.ipv4_src_addr}:${a.l4_src_port}`;
                    bValue = `${b.ipv4_src_addr}:${b.l4_src_port}`;
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
                case 'bytes':
                    return order === 'asc' ? a.in_bytes - b.in_bytes : b.in_bytes - a.in_bytes;
                default:
                    aValue = String(a[orderBy]);
                    bValue = String(b[orderBy]);
            }

            return order === 'asc' 
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });
    }, [flows, order, orderBy]);

    // Filter flows based on selected source IP (without port)
    const filteredFlows = React.useMemo(() => {
        if (!selectedSourceIP) return sortedFlows;
        return sortedFlows.filter(flow => flow.postNATSourceIPv4Address === selectedSourceIP);
    }, [sortedFlows, selectedSourceIP]);

    // Remove groupedFlows and use filteredFlows directly in the table
    return (
        <Grid container spacing={2}>
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
                                        Original Source IP:Port
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
                                    <TableSortLabel
                                        active={orderBy === 'destIP'}
                                        direction={orderBy === 'destIP' ? order : 'asc'}
                                        onClick={() => handleSort('destIP')}
                                    >
                                        Original Destination IP:Port
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell>
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
                                </TableCell>
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
                                        active={orderBy === 'bytes'}
                                        direction={orderBy === 'bytes' ? order : 'asc'}
                                        onClick={() => handleSort('bytes')}
                                    >
                                        Bytes
                                    </TableSortLabel>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredFlows.map((flow, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        {`${flow.sourceDNS || flow.ipv4_src_addr}:${flow.l4_src_port}`}
                                    </TableCell>
                                    <TableCell>
                                        {`${flow.destDNS || flow.ipv4_dst_addr}:${flow.l4_dst_port}`}
                                    </TableCell>
                                    <TableCell>
                                        {`${flow.postNATSourceIPv4Address}:${flow.postNAPTSourceTransportPort}`}
                                    </TableCell>
                                    <TableCell>
                                        {`${flow.postNATDestinationIPv4Address}:${flow.postNAPTDestinationTransportPort}`}
                                    </TableCell>
                                    <TableCell>{getProtocolName(flow.protocol)}</TableCell>
                                    <TableCell>{flow.in_bytes}</TableCell>
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