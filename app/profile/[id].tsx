import { useAuth } from '@/providers/auth-context';
import { getConversationByMatchId } from '@/services/chat'; // 👈 crearemos esta función
import { getMatch } from '@/services/match';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import ProgressiveProfileScreen from '../progressive-profile';

export default function ProfileDetail() {
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { accessToken } = useAuth();
  const [unlockLevel, setUnlockLevel] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!matchId) return;

    const fetchData = async () => {
      try {
        // Obtener match
        const match = (await getMatch(matchId)) as { unlock_level: number };
        setUnlockLevel(match.unlock_level);

        // Obtener conversación asociada a este match
        if (accessToken) {
          const conversation = await getConversationByMatchId(matchId, accessToken);
          setConversationId(conversation?.id || null);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(true);
      }
    };
    fetchData();
  }, [matchId, accessToken]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Error al cargar el perfil</Text>
      </View>
    );
  }

  if (unlockLevel === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Cargando...</Text>
      </View>
    );
  }

  return (
    <ProgressiveProfileScreen
      userId={id}
      initialUnlockLevel={unlockLevel}
      conversationId={conversationId}
    />
  );
}