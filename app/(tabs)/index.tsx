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

      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Cerrar sesion</Text>
      </Pressable>
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
    color: '#2563eb',
    fontSize: 14,
  },
  logoutButton: {
    marginTop: 8,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
