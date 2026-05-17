// components/ProgressiveTextField.tsx
import { Text, TextProps } from 'react-native';

export default function ProgressiveTextField({ unlockLevel, threshold = 0, children, ...props }: { unlockLevel: number; threshold?: number } & TextProps) {
  const isVisible = unlockLevel >= threshold;
  const opacity = Math.min(1, (unlockLevel / 100) * 1.2); // opacidad gradual
  if (!isVisible && threshold > 0) return null;
  return <Text {...props} style={[props.style, { opacity }]}>{children}</Text>;
}