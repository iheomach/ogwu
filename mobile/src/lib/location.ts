import * as Location from 'expo-location';

export type LocationSummary = {
  city: string | null;
  state: string | null;
  country: string | null;
};

export async function requestAndGetLocation(): Promise<LocationSummary> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { city: null, state: null, country: null };

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const [place] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  return {
    city: place?.city || place?.district || null,
    state: place?.region || null,
    country: place?.country || null,
  };
}

export function formatLocation(loc: LocationSummary | null): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
