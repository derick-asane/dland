import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fileUrl } from '@/api/client';
import type { LandImage } from '@/api/types';
import { colors } from '@/theme';

export function ImageGallery({ images, height = 260 }: { images: LandImage[]; height?: number }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Ionicons name="image-outline" size={48} color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {images.map((img) => (
          <Image key={img.id} source={{ uri: fileUrl(img.url) }} style={{ width, height, backgroundColor: colors.border }} />
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1}/{images.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  counter: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
