import { useAuth } from '@/providers/auth-context';
import { getUserMatches } from '@/services/match';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface Match {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
  compatibility_score: number;
  reasons: string[];
  unlock_level: number;
  created_at: string;
  updated_at: string;
}

interface UserProfile {
  id: string;
  nombre: string;
  email: string;
  fotos?: string[];
}

export default function MatchServiceScreen() {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  const loadMatches = async () => {
    if (!user?.id || !accessToken) return;
    setLoading(true);
    try {
      const data = await getUserMatches(user.id, accessToken);
      const matchesList = data.matches || [];
      setMatches(matchesList);

      // Cargar perfiles de los otros usuarios
      const profileMap: Record<string, UserProfile> = {};
      for (const match of matchesList) {
        const otherId = match.user_a_id === user.id ? match.user_b_id : match.user_a_id;
        try {
          const res = await fetch(`http://192.168.1.80:8000/users/${otherId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (res.ok) {
            const profile = await res.json();
            profileMap[otherId] = profile;
          } else {
            profileMap[otherId] = { id: otherId, nombre: 'Usuario', email: '' };
          }
        } catch {
          profileMap[otherId] = { id: otherId, nombre: 'Usuario', email: '' };
        }
      }
      setProfiles(profileMap);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadMatches();
    }, [user?.id, accessToken])
  );

  const handlePress = (match: Match) => {
    const otherId = match.user_a_id === user?.id ? match.user_b_id : match.user_a_id;
    router.push(`/profile/${otherId}?matchId=${match.id}`);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ff2d78" />
        <Text style={{ marginTop: 10 }}>Cargando tus matches...</Text>
      </View>
    );
  }

  if (matches.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Sin matches aún</Text>
        <Text style={styles.subtitle}>Explora y da "Me interesa" para conectar</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={matches}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const otherId = item.user_a_id === user?.id ? item.user_b_id : item.user_a_id;
        const profile = profiles[otherId];
        const photoUrl = profile?.fotos?.[0] || 'https://randomuser.me/api/portraits/women/68.jpg';
        const name = profile?.nombre || 'Usuario';
        return (
          <Pressable style={styles.card} onPress={() => handlePress(item)}>
            <Image source={{ uri: photoUrl }} style={styles.avatar} />
            <View style={styles.info}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.score}>Compatibilidad: {item.compatibility_score}%</Text>
              <Text style={styles.unlock}>Nivel desbloqueo: {item.unlock_level}%</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#666', textAlign: 'center' },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, marginRight: 12 },
  info: { flex: 1, justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  score: { fontSize: 12, color: '#ff2d78', marginTop: 2 },
  unlock: { fontSize: 12, color: '#666', marginTop: 2 },
});