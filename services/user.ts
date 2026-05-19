import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useAuth } from '@/providers/auth-context';
import { getMatch } from '@/services/match';
import { getUserProfile } from '@/services/user';
import { getConversationByMatchId } from '@/services/chat';
import ProgressiveProfileScreen from '../progressive-profile';

export default function ProfileDetail() {
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { accessToken } = useAuth();
  const [unlockLevel, setUnlockLevel] = useState<number | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!matchId || !accessToken || !id) return;

    const fetchData = async () => {
      try {
        const [match, conversation, userProfile] = await Promise.all([
          getMatch(matchId),
          getConversationByMatchId(matchId, accessToken),
          getUserProfile(id as string, accessToken)
        ]);
        setUnlockLevel(match.unlock_level);
        setConversationId(conversation?.id || null);

        // Transformar perfil del backend al formato esperado por ProgressiveProfileScreen
        setProfileData({
          photoUrl: userProfile.fotos?.[0] || 'https://randomuser.me/api/portraits/women/68.jpg',
          vibe_summary: userProfile.bio || 'Sin biografía',
          social_style: userProfile.preferencias?.social_style || 'Por definir',
          emotional_style: userProfile.preferencias?.emotional_style || 'Por definir',
          depth_preference: userProfile.preferencias?.depth_preference || 'Por definir',
          interests: userProfile.intereses || [],
          hobbies: [],
          favorite_environments: [],
          traits: [],
          current_mood_theme: '',
        });
      } catch (err) {
        console.error(err);
        setError(true);
      }
    };
    fetchData();
  }, [matchId, id, accessToken]);

  if (error) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Error al cargar el perfil</Text></View>;
  }
  if (unlockLevel === null || !profileData) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Cargando...</Text></View>;
  }

  return (
    <ProgressiveProfileScreen
      userId={id as string}
      initialUnlockLevel={unlockLevel}
      conversationId={conversationId}
      profileData={profileData}
    />
  );
}