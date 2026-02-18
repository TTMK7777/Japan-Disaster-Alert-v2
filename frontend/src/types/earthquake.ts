export interface Earthquake {
  id: string;
  time: string;
  location: string;
  location_translated?: string;
  magnitude: number;
  max_intensity: string;
  max_intensity_translated?: string;
  depth: number;
  latitude: number;
  longitude: number;
  tsunami_warning: string;
  tsunami_warning_translated?: string;
  message: string;
  message_translated?: string;
}
