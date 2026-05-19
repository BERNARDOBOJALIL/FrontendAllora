import { useLocalSearchParams } from 'expo-router';
import ProgressiveProfileScreen from '../progressive-profile';

export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProgressiveProfileScreen userId={id} />;
}