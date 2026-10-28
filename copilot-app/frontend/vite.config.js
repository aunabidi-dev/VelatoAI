import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.BACKEND_URL || 'http://localhost:8000';
const paymentTarget = process.env.PAYMENT_URL || 'http://localhost:8001';

const wsBackendTarget = backendTarget.replace(/^http/, 'ws');
const wsPaymentTarget = paymentTarget.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/payment': {
        target: paymentTarget,
        changeOrigin: true
      },
      '/ws/payment': {
        target: wsPaymentTarget,
        ws: true
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true
      },
      '/ws': {
        target: wsBackendTarget,
        ws: true
      }
    }
  }
})
