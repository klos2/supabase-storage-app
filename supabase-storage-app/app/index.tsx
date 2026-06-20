import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase, STORAGE_BUCKET } from "../lib/storageClient";

// ─── Tipos locales ──────────────────────────────────────────────────────────

interface SelectedDocument {
  name: string;
  uri: string;
  mimeType: string;
  size: number;
}

interface UploadResult {
  fileName: string;
  publicUrl: string;
  type: "image" | "document";
}

// ─── Utilidades ─────────────────────────────────────────────────────────────
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split(".").pop() ?? "bin";
  return `${timestamp}_${random}.${extension}`;
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`No se pudo leer el archivo desde la URI: ${uri}`);
  }
  return response.blob();
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function HomeScreen(): React.ReactNode {
  // ── Estado ────────────────────────────────────────────────────────────────
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] =
    useState<SelectedDocument | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);

  // ── Selección de imagen ──────────────────────────────────────────────────
  const handleSelectImage = useCallback(async (): Promise<void> => {
    try {
      // Solicitar permiso al sistema (iOS lo requiere explícitamente)
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permiso denegado",
          "Se necesita acceso a la galería para seleccionar imágenes. " +
            "Puedes habilitarlo desde Ajustes del dispositivo.",
          [{ text: "Entendido" }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
        // Limpiar selección previa de documento para evitar ambigüedad
        setSelectedDocument(null);
        setLastUpload(null);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      Alert.alert("Error al seleccionar imagen", message);
    }
  }, []);

  // ── Selección de documento ───────────────────────────────────────────────
  const handleSelectDocument = useCallback(async (): Promise<void> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", // Acepta cualquier tipo de archivo
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedDocument({
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType ?? "application/octet-stream",
          size: asset.size ?? 0,
        });
        // Limpiar imagen previa
        setImageUri(null);
        setLastUpload(null);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      Alert.alert("Error al seleccionar documento", message);
    }
  }, []);

  // ── Subida al bucket ─────────────────────────────────────────────────────
  const handleUpload = useCallback(async (): Promise<void> => {
    if (!imageUri && !selectedDocument) {
      Alert.alert(
        "Sin archivo seleccionado",
        "Selecciona una imagen o un documento antes de subir.",
        [{ text: "OK" }]
      );
      return;
    }

    setIsUploading(true);
    setLastUpload(null);

    try {
      let blob: Blob;
      let fileName: string;
      let contentType: string;
      let uploadType: "image" | "document";

      if (imageUri) {
        // ── Subida de imagen ────────────────────────────────────────────
        blob = await uriToBlob(imageUri);
        const ext = imageUri.split(".").pop() ?? "jpg";
        fileName = generateUniqueFileName(`photo.${ext}`);
        contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
        uploadType = "image";
      } else if (selectedDocument) {
        // ── Subida de documento ─────────────────────────────────────────
        blob = await uriToBlob(selectedDocument.uri);
        fileName = generateUniqueFileName(selectedDocument.name);
        contentType = selectedDocument.mimeType;
        uploadType = "document";
      } else {
        throw new Error("Estado inválido: ningún archivo disponible.");
      }

      // ── Llamada a Supabase Storage ─────────────────────────────────────
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, blob, {
          contentType,
          upsert: false, // Falla si el nombre ya existe (por seguridad)
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // ── Obtener URL pública ────────────────────────────────────────────
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

      setLastUpload({
        fileName,
        publicUrl: urlData.publicUrl,
        type: uploadType,
      });

      Alert.alert(
        "✅ Subida exitosa",
        `El archivo fue almacenado correctamente en el bucket "${STORAGE_BUCKET}".\n\nNombre: ${fileName}`,
        [{ text: "Perfecto" }]
      );

      // Limpiar selección tras éxito
      setImageUri(null);
      setSelectedDocument(null);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Error inesperado durante la subida.";
      Alert.alert("❌ Error en la subida", message, [{ text: "Reintentar" }]);
    } finally {
      setIsUploading(false);
    }
  }, [imageUri, selectedDocument]);

  // ── Helpers de UI ─────────────────────────────────────────────────────────
  const hasSelection = imageUri !== null || selectedDocument !== null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>SUPABASE STORAGE</Text>
          </View>
          <Text style={styles.headerTitle}>Cloud Upload</Text>
          <Text style={styles.headerSubtitle}>
            Selecciona un archivo y súbelo de forma segura a tu bucket en la
            nube.
          </Text>
        </View>

        {/* ── SECCIÓN: IMAGEN ──────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>IMAGEN</Text>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleSelectImage}
            activeOpacity={0.75}
            disabled={isUploading}
          >
            <Text style={styles.buttonSecondaryIcon}>🖼</Text>
            <Text style={styles.buttonSecondaryText}>Seleccionar imagen</Text>
          </TouchableOpacity>

          {/* Thumbnail de vista previa */}
          {imageUri && (
            <View style={styles.thumbnailContainer}>
              <Image
                source={{ uri: imageUri }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.thumbnailOverlay}>
                <Text style={styles.thumbnailLabel}>Vista previa</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── SECCIÓN: DOCUMENTO ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>DOCUMENTO</Text>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={handleSelectDocument}
            activeOpacity={0.75}
            disabled={isUploading}
          >
            <Text style={styles.buttonSecondaryIcon}>📄</Text>
            <Text style={styles.buttonSecondaryText}>Seleccionar archivo</Text>
          </TouchableOpacity>

          {/* Metadatos del documento */}
          {selectedDocument && (
            <View style={styles.docInfo}>
              <Text style={styles.docName} numberOfLines={2}>
                {selectedDocument.name}
              </Text>
              <View style={styles.docMetaRow}>
                <Text style={styles.docMeta}>
                  {selectedDocument.mimeType}
                </Text>
                <View style={styles.docSizeBadge}>
                  <Text style={styles.docSizeText}>
                    {formatFileSize(selectedDocument.size)}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── BOTÓN PRINCIPAL: SUBIR ────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.button,
            styles.buttonPrimary,
            (!hasSelection || isUploading) && styles.buttonDisabled,
          ]}
          onPress={handleUpload}
          activeOpacity={0.8}
          disabled={!hasSelection || isUploading}
        >
          {isUploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator
                size="small"
                color={COLORS.textPrimary}
                style={{ marginRight: 10 }}
              />
              <Text style={styles.buttonPrimaryText}>Subiendo...</Text>
            </View>
          ) : (
            <Text style={styles.buttonPrimaryText}>
              {hasSelection ? "☁ Subir al servicio" : "Selecciona un archivo"}
            </Text>
          )}
        </TouchableOpacity>

        {/* ── RESULTADO DE LA ÚLTIMA SUBIDA ────────────────────────────── */}
        {lastUpload && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultIcon}>
                {lastUpload.type === "image" ? "🖼" : "📄"}
              </Text>
              <Text style={styles.resultTitle}>Archivo almacenado</Text>
            </View>
            <Text style={styles.resultFileName}>{lastUpload.fileName}</Text>
            <Text style={styles.resultUrlLabel}>URL pública:</Text>
            <Text style={styles.resultUrl} numberOfLines={3}>
              {lastUpload.publicUrl}
            </Text>
          </View>
        )}

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <Text style={styles.footer}>
          Bucket: <Text style={styles.footerHighlight}>{STORAGE_BUCKET}</Text>{" "}
          · Supabase Storage
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Paleta de colores ──────────────────────────────────────────────────────

const COLORS = {
  bg: "#1A122C",
  card: "#241838",
  cardBorder: "#3B2A5A",
  accentPurple: "#6B21A8",
  accentPurpleLight: "#7C3AED",
  accentGold: "#F59E0B",
  accentGoldLight: "#FCD34D",
  textPrimary: "#F3F0FA",
  textSecondary: "#9B8EC4",
  textMuted: "#5E4E80",
  success: "#10B981",
  error: "#EF4444",
  disabled: "#3B2A5A",
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 48,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  headerBadge: {
    backgroundColor: COLORS.accentPurple,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 14,
  },
  headerBadgeText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 280,
  },

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    marginBottom: 16,
  },
  cardLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 14,
  },

  // Botones secundarios
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondary: {
    flexDirection: "row",
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: COLORS.accentPurple,
  },
  buttonSecondaryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  buttonSecondaryText: {
    color: COLORS.accentPurpleLight,
    fontSize: 15,
    fontWeight: "600",
  },

  // Botón principal
  buttonPrimary: {
    backgroundColor: COLORS.accentPurple,
    marginTop: 8,
    paddingVertical: 17,
    shadowColor: COLORS.accentPurple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonPrimaryText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    backgroundColor: COLORS.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Thumbnail
  thumbnailContainer: {
    marginTop: 14,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.accentGold,
  },
  thumbnail: {
    width: "100%",
    height: 180,
  },
  thumbnailOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(26,18,44,0.75)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  thumbnailLabel: {
    color: COLORS.accentGoldLight,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },

  // Documento info
  docInfo: {
    marginTop: 14,
    backgroundColor: "#1E1530",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accentGold,
  },
  docName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  docMeta: {
    color: COLORS.textSecondary,
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  docSizeBadge: {
    backgroundColor: COLORS.accentGold + "22",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.accentGold + "44",
  },
  docSizeText: {
    color: COLORS.accentGold,
    fontSize: 11,
    fontWeight: "600",
  },

  // Resultado
  resultCard: {
    marginTop: 20,
    backgroundColor: "#0D2E22",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.success + "55",
    padding: 20,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  resultIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  resultTitle: {
    color: COLORS.success,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  resultFileName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    marginBottom: 10,
  },
  resultUrlLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  resultUrl: {
    color: COLORS.accentGold,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    lineHeight: 16,
  },

  // Footer
  footer: {
    textAlign: "center",
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 32,
  },
  footerHighlight: {
    color: COLORS.accentPurpleLight,
    fontWeight: "600",
  },
});