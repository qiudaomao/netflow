import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:8088',
        ws: true
      },
      '/flows': {
        target: 'http://localhost:8088'
      }
    }
  }
});
