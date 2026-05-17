import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/providers/auth-context';

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const { isAuthenticated, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('login');
  const [nombre, setNombre] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Redirect href='/profile-builder' />;
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
        router.replace('/profile-builder');
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
      router.replace('/profile-builder');
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
      <LinearGradient
        colors={['#fef5f0', '#fff9f7']}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContainer}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/allora-logo.png')}
                style={styles.logo}
                resizeMode='contain'
              />
            </View>
            <Text style={styles.title}>Allora</Text>
            <Text style={styles.subtitle}>
              {mode === 'login'
                ? 'Bienvenido de vuelta'
                : 'Únete a nuestra comunidad'}
            </Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setMode('login')}
                style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
              >
                {mode === 'login' ? (
                  <LinearGradient
                    colors={['#ff6b9d', '#ff9a76']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modeButtonGradient}
                  >
                    <Text style={styles.modeTextActive}>Login</Text>
                  </LinearGradient>
                ) : (
                  <Text style={styles.modeText}>Login</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setMode('register')}
                style={[
                  styles.modeButton,
                  mode === 'register' && styles.modeButtonActive,
                ]}
              >
                {mode === 'register' ? (
                  <LinearGradient
                    colors={['#ff6b9d', '#ff9a76']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modeButtonGradient}
                  >
                    <Text style={styles.modeTextActive}>Registro</Text>
                  </LinearGradient>
                ) : (
                  <Text style={styles.modeText}>Registro</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.inputsContainer}>
              {mode === 'register' && (
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Nombre completo</Text>
                  <TextInput
                    placeholder='Juan Pérez'
                    value={nombre}
                    onChangeText={setNombre}
                    style={styles.input}
                    placeholderTextColor='#aaaaaa'
                  />
                </View>
              )}

              {mode === 'login' ? (
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputLabel}>Email o teléfono</Text>
                  <TextInput
                    placeholder='ejemplo@email.com'
                    value={identifier}
                    onChangeText={setIdentifier}
                    style={styles.input}
                    autoCapitalize='none'
                    placeholderTextColor='#aaaaaa'
                  />
                </View>
              ) : (
                <>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Email (opcional)</Text>
                    <TextInput
                      placeholder='ejemplo@email.com'
                      value={email}
                      onChangeText={setEmail}
                      style={styles.input}
                      autoCapitalize='none'
                      keyboardType='email-address'
                      placeholderTextColor='#aaaaaa'
                    />
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputLabel}>Teléfono (opcional)</Text>
                    <TextInput
                      placeholder='+34 612 345 678'
                      value={telefono}
                      onChangeText={setTelefono}
                      style={styles.input}
                      keyboardType='phone-pad'
                      placeholderTextColor='#aaaaaa'
                    />
                  </View>
                </>
              )}

              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Contraseña</Text>
                <TextInput
                  placeholder='Ingresa tu contraseña'
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                  autoCapitalize='none'
                  placeholderTextColor='#aaaaaa'
                />
              </View>
            </View>

            {errorMessage && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <LinearGradient
              colors={['#ff6b9d', '#ff9a76']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitButtonGradient}
            >
              <Pressable
                onPress={submit}
                style={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color='#ffffff' />
                ) : (
                  <Text style={styles.submitText}>
                    {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                  </Text>
                )}
              </Pressable>
            </LinearGradient>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fef5f0',
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 50,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  logo: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    maxWidth: 280,
  },
  formContainer: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#f5e8e3',
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginBottom: 28,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 12,
  },
  modeButtonActive: {
    backgroundColor: 'transparent',
  },
  modeButtonGradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 12,
  },
  modeText: {
    color: '#cc8b7f',
    fontSize: 15,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  inputsContainer: {
    gap: 18,
    marginBottom: 24,
  },
  inputWrapper: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginLeft: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#ffc4d6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#111111',
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#fee',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b9d',
  },
  errorText: {
    color: '#ff6b9d',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButtonGradient: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  submitButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
