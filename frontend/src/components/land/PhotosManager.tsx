import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { api, fileUrl, upload } from '@/api/client';
import type { Land } from '@/api/types';
import { colors, radius, spacing } from '@/theme';
import { useLandFiles } from './useLandFiles';

const MAX_PHOTOS = 12;

/** Photo grid of a listing: add from the library, remove with the ✕. The first photo is the cover. */
export function PhotosManager({ land }: { land: Land }) {
  const { t } = useTranslation();
  const { busy, run } = useLandFiles(land.id);

  const addPhotos = () =>
    run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS - land.images.length,
        quality: 0.7,
      });
      if (result.canceled) return;
      await upload(`/lands/${land.id}/images`, {
        images: result.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `photo-${i}.jpg`, type: a.mimeType ?? 'image/jpeg' })),
      });
    });

  const removePhoto = (imageId: string) => run(() => api.delete(`/lands/${land.id}/images/${imageId}`));

  return (
    <View style={styles.grid}>
      {land.images.map((img, i) => (
        <View key={img.id} style={styles.cell}>
          <Image source={{ uri: fileUrl(img.url) }} style={styles.photo} />
          {i === 0 ? (
            <View style={styles.cover}>
              <Ionicons name="star" size={10} color="#fff" />
            </View>
          ) : null}
          <Pressable onPress={() => removePhoto(img.id)} style={styles.remove} hitSlop={8} accessibilityLabel={t('common.delete')}>
            <Ionicons name="close-circle" size={24} color="#fff" />
          </Pressable>
        </View>
      ))}
      {land.images.length < MAX_PHOTOS ? (
        <Pressable onPress={addPhotos} disabled={busy} style={[styles.cell, styles.add]} accessibilityRole="button">
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={28} color={colors.primary} />
              <Text style={styles.addText}>{t('land.addPhotos')}</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '31%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.border },
  cover: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: { position: 'absolute', top: 4, right: 4 },
  add: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.primary, fontSize: 12, marginTop: 4, textAlign: 'center' },
});
