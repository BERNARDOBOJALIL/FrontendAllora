import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/auth-context';

const C = {
  bg: '#FDFCFB',
  white: '#ffffff',
  ink: '#1A1A2E',
  inkMid: 'rgba(26,26,46,0.62)',
  rose: '#FF4E7A',
  roseSoft: '#FFF4F7',
  roseBorder: '#FFD1DD',
  gold: '#FF9B50',
  lav: '#8B5CF6',
  teal: '#14B8A6',
};

export default function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>ALLORA</Text>
          <Text style={styles.title}>Hola, {user?.nombre?.split(' ')[0] ?? 'tú'}</Text>
          <Text style={styles.subtitle}>Tu punto de partida para conectar, conversar y cuidar tu perfil.</Text>
        </View>

        <LinearGradient
          colors={['#FF4E7A', '#FF9B50']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroTitle}>Completa tu perfil con Allora</Text>
          <Text style={styles.heroText}>El agente te guía con preguntas simples y puedes editar todo manualmente.</Text>
          <Link href="/profile-builder" asChild>
            <Pressable style={styles.heroButton}>
              <Text style={styles.heroButtonText}>Abrir guía</Text>
            </Pressable>
          </Link>
        </LinearGradient>

        <View style={styles.quickGrid}>
          <Link href="/(tabs)/location" asChild>
            <Pressable style={styles.quickCard}>
              <View style={[styles.quickDot, { backgroundColor: C.rose }]} />
              <Text style={styles.quickTitle}>Radar</Text>
              <Text style={styles.quickText}>Encuentra personas y grupos cercanos.</Text>
            </Pressable>
          </Link>

          <Link href="/(tabs)/chat" asChild>
            <Pressable style={styles.quickCard}>
              <View style={[styles.quickDot, { backgroundColor: C.teal }]} />
              <Text style={styles.quickTitle}>Chats</Text>
              <Text style={styles.quickText}>Continúa tus conversaciones.</Text>
            </Pressable>
          </Link>

          <Link href="/(tabs)/my-profile" asChild>
            <Pressable style={styles.quickCard}>
              <View style={[styles.quickDot, { backgroundColor: C.lav }]} />
              <Text style={styles.quickTitle}>Mi perfil</Text>
              <Text style={styles.quickText}>Revisa gustos, estilo y preferencias.</Text>
            </Pressable>
          </Link>
        </View>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Cerrar sesion</Text>
      </Pressable>

      <Link href="/unlock-demo" style={{ marginTop: 20, color: '#ff2d78' }}>
        Probar desbloqueo de foto
      </Link>

      <Link href="/progressive-profile" style={styles.link}>
        Ver perfil con desbloqueo progresivo
      </Link>
    </ScrollView>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 120,
    gap: 18,
  },
  header: {
    gap: 5,
  },
  kicker: {
    color: C.rose,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },
  title: {
    color: C.ink,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  subtitle: {
    color: C.inkMid,
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  heroTitle: {
    color: C.white,
    fontSize: 22,
    fontWeight: '900',
  },
  heroText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 20,
  },
  heroButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: C.white,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  heroButtonText: {
    color: C.rose,
    fontSize: 14,
    fontWeight: '900',
  },
  quickGrid: {
    gap: 10,
  },
  quickCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.roseBorder,
  },
  quickDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  quickTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  quickText: {
    marginTop: 3,
    color: C.inkMid,
    fontSize: 13,
    lineHeight: 18,
  },
  accountCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.roseSoft,
    borderWidth: 1,
    borderColor: C.roseBorder,
  },
  sectionTitle: {
    color: C.rose,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  accountName: {
    color: C.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  accountMeta: {
    marginTop: 3,
    color: C.inkMid,
    fontSize: 13,
  },
  logoutButton: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.roseBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: C.rose,
    fontSize: 14,
    fontWeight: '900',
  },
});
