import * as Location from 'expo-location';

export type LocationSummary = {
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
};

export async function requestAndGetLocation(): Promise<LocationSummary> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { city: null, state: null, country: null, lat: null, lon: null };

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;

  const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });

  return {
    city: place?.city || place?.district || null,
    state: place?.region || null,
    country: place?.country || null,
    lat: latitude,
    lon: longitude,
  };
}

export function formatLocation(loc: LocationSummary | null): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
