import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// Datos estáticos de usuarios (simulan candidatos)
const STATIC_CANDIDATES = [
  {
    user_id: 'user_001',
    score: 85,
    reasons: ['Intereses compatibles', 'Cerca de ti', 'Edad similar'],
    profile: {
      id: 'user_001',
      nombre: 'Valentina Torres',
      edad: 26,
      fotos: ['https://randomuser.me/api/portraits/women/68.jpg'],
      intereses: ['Música', 'Fotografía', 'Senderismo'],
      ubicacion: { ciudad: 'Puebla' },
    },
    liked: false,
  },
  {
    user_id: 'user_002',
    score: 72,
    reasons: ['Gustos musicales', 'Misma ciudad'],
    profile: {
      id: 'user_002',
      nombre: 'Camila Reyes',
      edad: 24,
      fotos: ['https://randomuser.me/api/portraits/women/65.jpg'],
      intereses: ['Diseño', 'Música', 'Cocina'],
      ubicacion: { ciudad: 'Cholula' },
    },
    liked: false,
  },
  {
    user_id: 'user_003',
    score: 91,
    reasons: ['Compatibilidad alta', 'Pasatiempos compartidos'],
    profile: {
      id: 'user_003',
      nombre: 'Sofía Mendoza',
      edad: 28,
      fotos: ['https://randomuser.me/api/portraits/women/44.jpg'],
      intereses: ['Running', 'Ciencia', 'Viajes'],
      ubicacion: { ciudad: 'Puebla' },
    },
    liked: false,
  },
];

function scoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Alta';
  if (score >= 50) return 'Media';
  return 'Baja';
}

export default function ExploreScreen() {
  const router = useRouter();
  const [candidates, setCandidates] = React.useState(STATIC_CANDIDATES);

  const handleViewProfile = (userId: string) => {
    const matchId = "6a0c8684227d3eaec344ba89";
    router.push(`/profile/${userId}?matchId=${matchId}`);
  };

  const handleLike = (userId: string) => {
  const matchId = "6a0c8684227d3eaec344ba89"; // el ID de tu match
  router.push(`/profile/${userId}?matchId=${matchId}`);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Descubrir</Text>
          <Text style={styles.headerSub}>{candidates.length} personas compatibles</Text>
        </View>
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(item) => item.user_id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {/* Área presionable para ver perfil */}
            <Pressable onPress={() => handleViewProfile(item.user_id)} style={{ gap: 12 }}>
              <View style={styles.cardTop}>
                <View style={styles.avatarContainer}>
                  <Image source={{ uri: item.profile.fotos[0] }} style={styles.avatar} />
                  <View style={[styles.scoreBadge, { backgroundColor: scoreColor(item.score) }]}>
                    <Text style={styles.scoreBadgeText}>{Math.round(item.score)}</Text>
                  </View>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.nameText}>
                    {item.profile.nombre} <Text style={styles.ageText}>{item.profile.edad}</Text>
                  </Text>
                  {item.profile.ubicacion?.ciudad && (
                    <View style={styles.rowSmall}>
                      <MaterialCommunityIcons name="map-marker" size={13} color="#999" />
                      <Text style={styles.metaText}>{item.profile.ubicacion.ciudad}</Text>
                    </View>
                  )}
                  <View style={styles.compatRow}>
                    <View style={[styles.compatDot, { backgroundColor: scoreColor(item.score) }]} />
                    <Text style={[styles.compatLabel, { color: scoreColor(item.score) }]}>
                      Compatibilidad {scoreLabel(item.score)}
                    </Text>
                  </View>
                  <View style={styles.scoreBarBg}>
                    <View style={[styles.scoreBarFill, { width: `${item.score}%`, backgroundColor: scoreColor(item.score) }]} />
                  </View>
                </View>
              </View>

              {/* Razones */}
              <View style={styles.reasonsContainer}>
                {item.reasons.slice(0, 3).map((r, i) => (
                  <View key={i} style={styles.reasonChip}>
                    <MaterialCommunityIcons name="check-circle" size={12} color="#22c55e" />
                    <Text style={styles.reasonText}>{r}</Text>
                  </View>
                ))}
              </View>

              {/* Intereses */}
              <View style={styles.interestsRow}>
                {item.profile.intereses.slice(0, 4).map((interes, i) => (
                  <View key={i} style={styles.interesChip}>
                    <Text style={styles.interesText}>{interes}</Text>
                  </View>
                ))}
              </View>
            </Pressable>

            {/* Botón like */}
            <Pressable
              style={[styles.likeButton, item.liked && styles.likeButtonDone]}
              onPress={() => handleLike(item.user_id)}
              disabled={item.liked}
            >
              <MaterialCommunityIcons
                name={item.liked ? 'heart' : 'heart-outline'}
                size={18}
                color={item.liked ? '#ffffff' : '#ff2d78'}
              />
              <Text style={[styles.likeButtonText, item.liked && styles.likeButtonTextDone]}>
                {item.liked ? 'Solicitud enviada' : 'Me interesa'}
              </Text>
            </Pressable>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9f9fb' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111111', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#999999', marginTop: 2 },
  listContent: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  avatarContainer: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 18 },
  scoreBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  scoreBadgeText: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
  cardInfo: { flex: 1, gap: 5 },
  nameText: { fontSize: 18, fontWeight: '700', color: '#111111' },
  ageText: { fontSize: 16, fontWeight: '400', color: '#555555' },
  rowSmall: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: '#999999' },
  compatRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  compatDot: { width: 7, height: 7, borderRadius: 4 },
  compatLabel: { fontSize: 12, fontWeight: '600' },
  scoreBarBg: { height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  scoreBarFill: { height: 4, borderRadius: 2 },
  reasonsContainer: { gap: 5 },
  reasonChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reasonText: { fontSize: 12, color: '#555555' },
  interestsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  interesChip: { backgroundColor: '#fff0f5', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  interesText: { fontSize: 11, color: '#ff2d78', fontWeight: '600' },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#ff2d78',
    backgroundColor: '#ffffff',
    marginTop: 2,
  },
  likeButtonDone: { backgroundColor: '#ff2d78', borderColor: '#ff2d78' },
  likeButtonText: { fontSize: 14, fontWeight: '700', color: '#ff2d78' },
  likeButtonTextDone: { color: '#ffffff' },
});