import ProgressiveProfileImage from '@/components/ProgressiveProfileImage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

const PROFILE = {
  photoUrl: 'https://randomuser.me/api/portraits/women/68.jpg',
  vibe_summary: 'Tranquila y creativa, amante de los gatos y el café.',
  social_style: 'Selectiva pero abierta cuando hay confianza.',
  emotional_style: 'Cálida y empática.',
  depth_preference: 'Profundidad media, le gusta hablar de sentimientos pero sin presión.',
  interests: ['Música lo-fi', 'Fotografía analógica', 'Senderismo'],
  hobbies: ['Tocar guitarra', 'Escribir poesía', 'Cocinar postres'],
  favorite_environments: ['Cafés tranquilos', 'Parques con árboles', 'Librerías de viejo'],
  traits: ['Curiosa', 'Observadora', 'Leal'],
  current_mood_theme: 'Optimista, con ganas de conocer gente nueva',
};

const UNLOCK_THRESHOLDS = {
  GUSTOS: 40,
  PERSONALIDAD: 60,
  COMPLETO: 100,
};

export default function ProgressiveProfileScreen() {
  const [unlockLevel, setUnlockLevel] = useState(20);
  const [notification, setNotification] = useState<string | null>(null);
  const [hasGustos, setHasGustos] = useState(false);
  const [hasPersonalidad, setHasPersonalidad] = useState(false);
  const notificationFade = useRef(new Animated.Value(0)).current;
  const notificationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Efecto para detectar cuando se cruzan los umbrales y marcar como aparecidas
  useEffect(() => {
    if (unlockLevel >= UNLOCK_THRESHOLDS.GUSTOS && !hasGustos) {
      setHasGustos(true);
      showNotification('✨ ¡Nueva sección desbloqueada: Gustos! ✨');
    }
    if (unlockLevel >= UNLOCK_THRESHOLDS.PERSONALIDAD && !hasPersonalidad) {
      setHasPersonalidad(true);
      showNotification('✨ ¡Nueva sección desbloqueada: Personalidad! ✨');
    }
    if (unlockLevel >= UNLOCK_THRESHOLDS.COMPLETO) {
      showNotification('🎉 ¡Perfil completamente desbloqueado! 🎉');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [unlockLevel]);

  // Función para mostrar notificación temporal con animación
  const showNotification = (msg: string) => {
    if (notificationTimeout.current) clearTimeout(notificationTimeout.current);
    setNotification(msg);
    Animated.timing(notificationFade, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    notificationTimeout.current = setTimeout(() => {
      Animated.timing(notificationFade, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setNotification(null));
    }, 2000);
  };

  const increaseLevel = (amount: number = 10) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUnlockLevel(prev => Math.min(100, prev + amount));
  };

  const resetLevel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setUnlockLevel(20);
    setHasGustos(false);
    setHasPersonalidad(false);
    setNotification(null);
    if (notificationTimeout.current) clearTimeout(notificationTimeout.current);
    notificationFade.setValue(0);
  };

  const getOpacity = (level: number) => 0.2 + (level / 100) * 0.8;
  const progressColor = () => {
    if (unlockLevel < 30) return '#ff6b9d';
    if (unlockLevel < 70) return '#ff9a76';
    return '#10b981';
  };
  const getMotivationMessage = () => {
    if (unlockLevel < 30) return '💬 Envía mensajes para conocer más';
    if (unlockLevel < 70) return '🎉 ¡Vas muy bien! Sigue así';
    if (unlockLevel < 100) return '🔥 Casi lo tienes, sigue interactuando';
    return '✨ ¡Perfil completamente desbloqueado! ✨';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#fff5f8', '#fff']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.header}>
        <ProgressiveProfileImage photoUrl={PROFILE.photoUrl} unlockLevel={unlockLevel} style={styles.profileImage} />
        <Text style={styles.name}>demo</Text>
        <Text style={styles.levelText}>Desbloqueo: {unlockLevel}%</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${unlockLevel}%`, backgroundColor: progressColor() }]} />
        </View>
        <Text style={styles.motivationText}>{getMotivationMessage()}</Text>
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.button} onPress={() => increaseLevel(10)}>
            <LinearGradient colors={['#ff6b9d', '#ff9a76']} style={styles.buttonGradient}>
              <Text style={styles.buttonText}>+10% (enviar mensaje)</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={resetLevel}>
            <Text style={styles.resetButtonText}>Reiniciar</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {notification && (
        <Animated.View style={[styles.notification, { opacity: notificationFade }]}>
          <Text style={styles.notificationText}>{notification}</Text>
        </Animated.View>
      )}

      {/* Tarjeta "Sobre ti" siempre visible */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sobre ti</Text>
        <FieldRow icon="✦" label="Resumen de vibe" value={PROFILE.vibe_summary} opacity={getOpacity(unlockLevel)} />
        <FieldRow icon="◎" label="Estilo social" value={PROFILE.social_style} opacity={getOpacity(unlockLevel)} />
        <FieldRow icon="♡" label="Estilo emocional" value={PROFILE.emotional_style} opacity={getOpacity(unlockLevel)} />
        <FieldRow icon="◈" label="Profundidad" value={PROFILE.depth_preference} opacity={getOpacity(unlockLevel)} />
      </View>

      {/* Tarjeta "Gustos": aparece cuando hasGustos es true (nunca desaparece) */}
      {hasGustos && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gustos</Text>
          <FieldRow icon="★" label="Intereses" value={PROFILE.interests.join(', ')} opacity={getOpacity(unlockLevel)} />
          <FieldRow icon="◆" label="Hobbies" value={PROFILE.hobbies.join(', ')} opacity={getOpacity(unlockLevel)} />
          <FieldRow icon="⬡" label="Ambientes favoritos" value={PROFILE.favorite_environments.join(', ')} opacity={getOpacity(unlockLevel)} />
        </View>
      )}

      {/* Tarjeta "Personalidad": aparece cuando hasPersonalidad es true */}
      {hasPersonalidad && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personalidad</Text>
          <FieldRow icon="◉" label="Rasgos" value={PROFILE.traits.join(', ')} opacity={getOpacity(unlockLevel)} />
          <FieldRow icon="◐" label="Mood actual" value={PROFILE.current_mood_theme} opacity={getOpacity(unlockLevel)} />
        </View>
      )}

      {unlockLevel >= UNLOCK_THRESHOLDS.COMPLETO && (
        <View style={styles.completeCard}>
          <LinearGradient colors={['#ff6b9d', '#ff9a76']} style={styles.completeGradient}>
            <Text style={styles.completeText}>✨ ¡Has desbloqueado el perfil completo! ✨</Text>
            <Text style={styles.completeSubtext}>Ahora puedes ver toda su información</Text>
          </LinearGradient>
        </View>
      )}
      <View style={styles.footerSpace} />
    </ScrollView>
  );
}

function FieldRow({ icon, label, value, opacity }: { icon: string; label: string; value: string; opacity: number }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldIcon, { opacity }]}>{icon}</Text>
      <View style={styles.fieldContent}>
        <Text style={[styles.fieldLabel, { opacity }]}>{label}</Text>
        <Text style={[styles.fieldValue, { opacity }]} numberOfLines={2}>
          {value || 'Toca para agregar ›'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  profileImage: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#ff6b9d', marginBottom: 12 },
  name: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  levelText: { fontSize: 14, fontWeight: '600', color: '#ff6b9d', marginBottom: 8 },
  progressBarContainer: { width: width * 0.7, height: 8, backgroundColor: '#f0e6e9', borderRadius: 4, overflow: 'hidden', marginVertical: 12 },
  progressBar: { height: '100%', borderRadius: 4 },
  motivationText: { fontSize: 12, color: '#888', marginBottom: 16 },
  buttonGroup: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { borderRadius: 30, overflow: 'hidden', elevation: 2 },
  buttonGradient: { paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resetButton: { backgroundColor: '#e0e0e0', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 30 },
  resetButtonText: { color: '#666', fontWeight: '600', fontSize: 14 },
  notification: {
    backgroundColor: '#ff6b9d',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
  },
  notificationText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  fieldIcon: { fontSize: 18, width: 32, textAlign: 'center', color: '#ff6b9d' },
  fieldContent: { flex: 1, marginLeft: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 4 },
  fieldValue: { fontSize: 14, color: '#111', lineHeight: 20 },
  completeCard: { marginHorizontal: 16, marginTop: 24, borderRadius: 24, overflow: 'hidden', shadowColor: '#ff6b9d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  completeGradient: { padding: 20, alignItems: 'center' },
  completeText: { color: '#fff', fontWeight: 'bold', fontSize: 18, textAlign: 'center' },
  completeSubtext: { color: '#fff', fontSize: 12, marginTop: 6, opacity: 0.9 },
  footerSpace: { height: 40 },
});