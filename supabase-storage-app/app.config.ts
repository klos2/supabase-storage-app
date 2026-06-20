import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Supabase Storage App",
  slug: "supabase-storage-app",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#1A122C",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.universidad.supabasestorage",
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "Esta app necesita acceso a tu galería para seleccionar imágenes y subirlas al servicio de almacenamiento en la nube.",
      NSCameraUsageDescription:
        "Esta app puede usar la cámara para capturar imágenes directamente.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#1A122C",
    },
    package: "com.universidad.supabasestorage",
    permissions: ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-router", "expo-image-picker", "expo-document-picker", "expo-asset"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Las variables EXPO_PUBLIC_* son inyectadas automáticamente por Expo
    // desde el archivo .env — no se necesita mapeo manual aquí.
  },
});