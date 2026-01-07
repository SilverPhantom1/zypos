import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zypos.app',
  appName: 'ZYPOS',
  webDir: 'dist/zypos/browser',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Camera: {
      permissions: {
        camera: 'Esta app necesita acceso a la cámara para escanear códigos de barras'
      }
    },
    BarcodeScanner: {
      camera: {
        permissionPromptText: 'Esta app necesita acceso a la cámara para escanear códigos de barras'
      }
    }
  }
};

export default config;

