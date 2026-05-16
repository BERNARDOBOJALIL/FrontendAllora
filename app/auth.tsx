import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/providers/auth-context';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const { isAuthenticated, login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [nombre, setNombre] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Redirect href='/(tabs)' />;
  }

  const submit = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);

    try {
      setIsSubmitting(true);

      if (mode === 'login') {
        if (!identifier.trim() || !password.trim()) {
          throw new Error('Ingresa identifier y password.');
        }

        await login({
          identifier: identifier.trim(),
          password: password.trim(),
        });
        return;
      }

      if (!nombre.trim() || !password.trim()) {
        throw new Error('Ingresa nombre y password.');
      }

      if (!email.trim() && !telefono.trim()) {
        throw new Error('Ingresa email o telefono para registrarte.');
      }

      await register({
        nombre: nombre.trim(),
        password: password.trim(),
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo autenticar.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Allora</Text>
        <Text style={styles.subtitle}>Registro / Login</Text>

        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setMode('login')}
            style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
          >
            <Text
              style={[styles.modeText, mode === 'login' && styles.modeTextActive]}
            >
              Login
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('register')}
            style={[
              styles.modeButton,
              mode === 'register' && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === 'register' && styles.modeTextActive,
              ]}
            >
              Registro
            </Text>
          </Pressable>
        </View>

        {mode === 'register' && (
          <TextInput
            placeholder='Nombre'
            value={nombre}
            onChangeText={setNombre}
            style={styles.input}
          />
        )}

        {mode === 'login' ? (
          <TextInput
            placeholder='Email o telefono'
            value={identifier}
            onChangeText={setIdentifier}
            style={styles.input}
            autoCapitalize='none'
          />
        ) : (
          <>
            <TextInput
              placeholder='Email (opcional)'
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize='none'
              keyboardType='email-address'
            />
            <TextInput
              placeholder='Telefono (opcional)'
              value={telefono}
              onChangeText={setTelefono}
              style={styles.input}
              keyboardType='phone-pad'
            />
          </>
        )}

        <TextInput
          placeholder='Password'
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          autoCapitalize='none'
        />

        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <Pressable onPress={submit} style={styles.submitButton}>
          {isSubmitting ? (
            <ActivityIndicator color='#ffffff' />
          ) : (
            <Text style={styles.submitText}>
              {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111111',
  },
  subtitle: {
    fontSize: 16,
    color: '#555555',
    marginBottom: 12,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#f4f4f4',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    marginBottom: 8,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 10,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dddddd',
  },
  modeText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#111111',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#ffffff',
  },
  submitButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#c1121f',
    fontSize: 13,
  },
});
