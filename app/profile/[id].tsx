import { useLocalSearchParams } from 'expo-router';
import ProgressiveProfileScreen from '../progressive-profile';

export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Por ahora, no usamos el id, pero puedes mostrarlo si quieres
  return <ProgressiveProfileScreen />;
}