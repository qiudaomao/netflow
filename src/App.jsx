import React from 'react';
import FlowTable from './FlowTable';
import { Container, Typography, Box } from '@mui/material';

const App = () => {
    return (
        <Container>
            <Box sx={{ my: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    NetFlow Monitor
                </Typography>
                <FlowTable />
            </Box>
        </Container>
    );
};

export default App;