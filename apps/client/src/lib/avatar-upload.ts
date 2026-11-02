import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const SIZE = 512;

/**
 * Lets the user pick a photo and returns it as a square 512px JPEG (base64),
 * or null if they cancelled. Shrinking on-device keeps uploads small.
 */
export async function pickAvatar(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const { uri, width, height } = result.assets[0];

  const ctx = ImageManipulator.manipulate(uri);
  // Web has no crop UI, so center-crop to a square here.
  if (width && height && width !== height) {
    const side = Math.min(width, height);
    ctx.crop({ originX: (width - side) / 2, originY: (height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: SIZE, height: SIZE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  return saved.base64 ?? null;
}
