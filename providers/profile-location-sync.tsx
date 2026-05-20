import * as Location from 'expo-location';
import React, { useEffect, useRef } from 'react';

import { useAuth } from '@/providers/auth-context';
import { patchProfileMemory } from '@/services/profile';

const LOCATION_SYNC_INTERVAL_MS = 60_000;
const LOCATION_DISTANCE_INTERVAL_M = 100;

type Coords = {
  lat: number;
  lng: number;
};

function sameCoords(a: Coords | null, b: Coords): boolean {
  if (!a) return false;
  return (
    Math.abs(a.lat - b.lat) < 0.000001 &&
    Math.abs(a.lng - b.lng) < 0.000001
  );
}

export function ProfileLocationSync() {
  const { user, accessToken, isAuthenticated } = useAuth();
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coordsRef = useRef<Coords | null>(null);

  useEffect(() => {
    let active = true;

    const stop = () => {
      watcherRef.current?.remove();
      watcherRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const syncCoords = async (coords: Coords) => {
      if (!user?.id || !accessToken) return;
      if (sameCoords(coordsRef.current, coords)) return;
      coordsRef.current = coords;
      try {
        await patchProfileMemory(user.id, accessToken, {
          location: coords,
        });
      } catch {
        // Best-effort background sync. Match refresh will try again later.
      }
    };

    const start = async () => {
      if (!isAuthenticated || !user?.id || !accessToken) return;

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active || permission.status !== 'granted') return;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await syncCoords({
        lat: current.coords.latitude,
        lng: current.coords.longitude,
      });

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LOCATION_SYNC_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
        },
        (position) => {
          void syncCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
      );

      intervalRef.current = setInterval(async () => {
        try {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await syncCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        } catch {
          // Keep the watcher alive even if one polling attempt fails.
        }
      }, LOCATION_SYNC_INTERVAL_MS);
    };

    void start();

    return () => {
      active = false;
      stop();
    };
  }, [accessToken, isAuthenticated, user?.id]);

  return null;
}
