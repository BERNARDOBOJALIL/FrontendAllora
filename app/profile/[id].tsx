import { useAuth } from '@/providers/auth-context';
import { getConversationByMatchId } from '@/services/chat';
import { getMatch } from '@/services/match';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import ProgressiveProfileScreen from '../progressive-profile';

// 🔁 Datos de ejemplo para usuarios específicos (mientras el backend no provea el perfil real)
const FALLBACK_PROFILES: Record<string, any> = {
  // ID de TestMatch2 (cámbialo por el ID real de tu otro usuario)
  '6a0ca0c93074208c646beed7': {
    photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    vibe_summary: 'Entusiasta de la tecnología y el café, siempre aprendiendo algo nuevo.',
    social_style: 'Abierto a conversaciones interesantes, valora la autenticidad.',
    emotional_style: 'Empático y reflexivo.',
    depth_preference: 'Le gusta profundizar en temas que le apasionan.',
    interests: ['Programación', 'Videojuegos', 'Senderismo', 'Café de especialidad'],
    hobbies: ['Leer', 'Escribir', 'Hacer ejercicio'],
    favorite_environments: ['Bibliotecas', 'Cafeterías tranquilas', 'Montañas'],
    traits: ['Curioso', 'Analítico', 'Leal'],
    current_mood_theme: 'Optimista, con ganas de compartir ideas',
  },
  // Puedes agregar más perfiles para otros IDs aquí
};

export default function ProfileDetail() {
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { accessToken } = useAuth();
  const [unlockLevel, setUnlockLevel] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!matchId) return;

    const fetchData = async () => {
      try {
        // 1. Obtener el nivel de desbloqueo real del match
        const match = (await getMatch(matchId)) as { unlock_level: number };
        setUnlockLevel(match.unlock_level);

        // 2. Obtener el conversationId para navegar al chat
        if (accessToken) {
          const conversation = await getConversationByMatchId(matchId, accessToken);
          setConversationId(conversation?.id || null);
        }

        // 3. Intentar obtener el perfil real del usuario (cuando el endpoint exista)
        // Por ahora, usamos el fallback si el ID está en la lista, o datos genéricos como último recurso.
        // Cuando el backend funcione, descomenta la llamada real y asigna los datos.
        /*
        const userProfile = await getUserProfile(id as string, accessToken);
        setProfileData({
          photoUrl: userProfile.fotos?.[0] || DEFAULT_PHOTO,
          vibe_summary: userProfile.bio || '',
          social_style: userProfile.preferencias?.social_style || '',
          emotional_style: userProfile.preferencias?.emotional_style || '',
          depth_preference: userProfile.preferencias?.depth_preference || '',
          interests: userProfile.intereses || [],
          hobbies: [],
          favorite_environments: [],
          traits: [],
          current_mood_theme: '',
        });
        */

        // Fallback: si existe un perfil personalizado para este userId, lo usamos
        if (FALLBACK_PROFILES[id as string]) {
          setProfileData(FALLBACK_PROFILES[id as string]);
        } else {
          // Si no hay fallback, usamos un perfil genérico (podría ser DEFAULT_PROFILE)
          // Pero es mejor no mostrarlo para que no parezca que todos son iguales.
          // Aquí podrías dejar que ProgressiveProfileScreen use su DEFAULT_PROFILE.
          setProfileData(null);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(true);
      }
    };
    fetchData();
  }, [matchId, id, accessToken]);

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

  // Pasamos profileData (si existe) a ProgressiveProfileScreen, que usará esos datos en lugar de DEFAULT_PROFILE
  return (
    <ProgressiveProfileScreen
      userId={id}
      initialUnlockLevel={unlockLevel}
      conversationId={conversationId}
      profileData={profileData || undefined}
    />
  );
}