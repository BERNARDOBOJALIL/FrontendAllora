import ProgressiveProfileImage from '@/components/ProgressiveProfileImage';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

// Simulación de obtención de perfil (reemplazar con llamada real)
const fetchProfile = async (userId: string) => {
  // Aquí iría el fetch a /auth/profile-memory/{userId}
  return {
    photoUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
    vibe_summary: 'Tranquila y creativa, amante de los gatos y el café.',
    interests: ['Música lo-fi', 'Fotografía'],
    hobbies: ['Tocar guitarra'],
    favorite_environments: ['Cafés', 'Parques'],
  };
};

export default function ProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [unlockLevel, setUnlockLevel] = useState(20); // Esto vendría del match

  useEffect(() => {
    fetchProfile(id).then(setProfile);
  }, [id]);

  if (!profile) return <Text>Cargando...</Text>;

  const getOpacity = (level: number) => 0.2 + (level / 100) * 0.8;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ProgressiveProfileImage photoUrl={profile.photoUrl} unlockLevel={unlockLevel} style={styles.image} />
      <Text style={[styles.label, { opacity: getOpacity(unlockLevel) }]}>Sobre mí:</Text>
      <Text style={[styles.bio, { opacity: getOpacity(unlockLevel) }]}>{profile.vibe_summary}</Text>
      <Text style={[styles.label, { opacity: getOpacity(unlockLevel) }]}>Intereses:</Text>
      <Text style={[styles.text, { opacity: getOpacity(unlockLevel) }]}>{profile.interests.join(', ')}</Text>
      {unlockLevel >= 50 && <Text style={styles.label}>Hobbies:</Text>}
      {unlockLevel >= 50 && <Text style={styles.text}>{profile.hobbies.join(', ')}</Text>}
      {unlockLevel >= 80 && <Text style={styles.label}>Entornos favoritos:</Text>}
      {unlockLevel >= 80 && <Text style={styles.text}>{profile.favorite_environments.join(', ')}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: 'center' },
  image: { width: 120, height: 120, borderRadius: 60, marginBottom: 15 },
  label: { fontWeight: 'bold', marginTop: 10 },
  bio: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  text: { fontSize: 14 },
});