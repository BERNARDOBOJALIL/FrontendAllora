import { Image, type ImageStyle, type StyleProp } from 'react-native';

export default function ProgressiveProfileImage({ 
  photoUrl, 
  unlockLevel,
  style 
}: { 
  photoUrl: string; 
  unlockLevel: number;
  style?: StyleProp<ImageStyle>;
}) {
  const blurRadius = Math.max(0, 30 - (unlockLevel / 100) * 30);
  return (
    <Image
      source={{ uri: photoUrl }}
      style={[{ width: 200, height: 200, borderRadius: 100 }, style]}
      blurRadius={blurRadius}
    />
  );
}