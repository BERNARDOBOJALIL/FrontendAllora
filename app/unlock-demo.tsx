import ProgressiveProfileImage from '@/components/ProgressiveProfileImage';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function UnlockDemoScreen() {
  const [unlockLevel, setUnlockLevel] = useState(20);

  const increaseLevel = () => {
    setUnlockLevel(prev => Math.min(100, prev + 10));
  };

  const getOpacity = (level: number) => 0.2 + (level / 100) * 0.8;

  const profile = {
    photoUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
    vibe_summary: 'Tranquila y creativa, amante de los gatos y el café.',
    interests: ['Música lo-fi', 'Fotografía', 'Senderismo'],
    hobbies: ['Tocar guitarra', 'Escribir poesía'],
    favorite_environments: ['Cafés', 'Parques', 'Librerías'],
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Demo: Desbloqueo progresivo</Text>
      <Text>Nivel actual: {unlockLevel}%</Text>
      <Button title="Enviar mensaje (simular)" onPress={increaseLevel} />

      <View style={styles.card}>
        <ProgressiveProfileImage
          photoUrl={profile.photoUrl}
          unlockLevel={unlockLevel}
          style={styles.image}
        />

        <Text style={[styles.label, { opacity: getOpacity(unlockLevel) }]}>
          Sobre mí:
        </Text>
        <Text style={[styles.bio, { opacity: getOpacity(unlockLevel) }]}>
          {profile.vibe_summary}
        </Text>

        <Text style={[styles.label, { opacity: getOpacity(unlockLevel) }]}>
          Intereses:
        </Text>
        <Text style={[styles.text, { opacity: getOpacity(unlockLevel) }]}>
          {profile.interests.join(', ')}
        </Text>

        {unlockLevel >= 50 && (
          <>
            <Text style={styles.label}>Hobbies:</Text>
            <Text style={styles.text}>{profile.hobbies.join(', ')}</Text>
          </>
        )}

        {unlockLevel >= 80 && (
          <>
            <Text style={styles.label}>Entornos favoritos:</Text>
            <Text style={styles.text}>{profile.favorite_environments.join(', ')}</Text>
          </>
        )}

        {unlockLevel >= 100 && (
          <Button title="Función especial (compartir perfil)" onPress={() => alert('Desbloqueado')} />
        )}

        <Link href="/(tabs)/profile-detail?id=usuario-ejemplo-123" style={styles.link}>
          Ver perfil de otro usuario (simulado)
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  card: { width: '100%', marginTop: 20, padding: 15, backgroundColor: '#f9f9f9', borderRadius: 10 },
  image: { width: 120, height: 120, borderRadius: 60, alignSelf: 'center', marginBottom: 15 },
  label: { fontWeight: 'bold', marginTop: 10, fontSize: 14 },
  bio: { fontSize: 14, marginBottom: 5, fontStyle: 'italic' },
  text: { fontSize: 14, marginBottom: 5 },
  link: { marginTop: 20, color: '#ff2d78', textDecorationLine: 'underline', textAlign: 'center' }
});