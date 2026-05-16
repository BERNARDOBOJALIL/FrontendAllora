import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/providers/auth-context';

export default function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Inicio</Text>
      <Text style={styles.subtitle}>Sesion activa</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Usuario</Text>
        <Text style={styles.value}>{user?.nombre ?? 'Sin nombre'}</Text>

        <Text style={styles.label}>ID</Text>
        <Text style={styles.value}>{user?.id ?? '-'}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email ?? '-'}</Text>
      </View>

      <Link href='/(tabs)/location' style={styles.link}>
        Ir a Radar de ubicacion
      </Link>

      <LinearGradient
        colors={['#ff6b9d', '#ff9a76']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.logoutGradient}
      >
        <Pressable onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 40,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: '#666666',
  },
  value: {
    fontSize: 14,
    color: '#111111',
    marginBottom: 6,
  },
  link: {
    color: '#ff6b9d',
    fontSize: 14,
  },
  logoutGradient: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  logoutButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
