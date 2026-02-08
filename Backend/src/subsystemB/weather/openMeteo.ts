import { fetchJson, logger } from '../../../shared/utils/index.js';
import type { WeatherCurrent, WeatherForecastHour, WeatherResponse } from '../../../shared/types/index.js';

/**
 * Open-Meteo API (free, no key required)
 * https://open-meteo.com/en/docs
 */

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes -> descriptions
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall',
  77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers',
  82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    relative_humidity_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
}

export async function fetchCurrentWeather(lat: number, lon: number): Promise<WeatherCurrent | null> {
  const url = `${BASE_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,relative_humidity_2m,precipitation,weather_code&timezone=auto`;

  try {
    const data = await fetchJson<OpenMeteoResponse>(url, { timeoutMs: 8000 });
    if (!data.current) return null;

    return {
      temperature: data.current.temperature_2m,
      windSpeed: data.current.wind_speed_10m,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      weatherCode: data.current.weather_code,
      description: WMO_CODES[data.current.weather_code] || 'Unknown',
    };
  } catch (err) {
    logger.error({ err }, 'Open-Meteo current fetch failed');
    return null;
  }
}

export async function fetchForecastWeather(lat: number, lon: number, days = 7): Promise<WeatherForecastHour[]> {
  const url = `${BASE_URL}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,relative_humidity_2m,precipitation_probability,weather_code&forecast_days=${days}&timezone=auto`;

  try {
    const data = await fetchJson<OpenMeteoResponse>(url, { timeoutMs: 10000 });
    if (!data.hourly || !data.hourly.time) return [];

    const hours: WeatherForecastHour[] = [];
    for (let i = 0; i < data.hourly.time.length; i++) {
      hours.push({
        time: data.hourly.time[i],
        temperature: data.hourly.temperature_2m[i],
        windSpeed: data.hourly.wind_speed_10m[i],
        humidity: data.hourly.relative_humidity_2m[i],
        precipitationProbability: data.hourly.precipitation_probability[i],
        weatherCode: data.hourly.weather_code[i],
      });
    }

    return hours;
  } catch (err) {
    logger.error({ err }, 'Open-Meteo forecast fetch failed');
    return [];
  }
}

export async function fetchWeather(lat: number, lon: number, mode: 'live' | 'forecast', days = 7): Promise<WeatherResponse> {
  if (mode === 'live') {
    const current = await fetchCurrentWeather(lat, lon);
    return {
      mode: 'live',
      lat, lon,
      current: current || undefined,
      generatedAt: new Date().toISOString(),
    };
  } else {
    const hourly = await fetchForecastWeather(lat, lon, days);
    return {
      mode: 'forecast',
      lat, lon,
      hourly,
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Extract weather-based risk adjustments from forecast data.
 * Used by the prediction model to adjust scores.
 */
export interface WeatherRiskAdjustment {
  heatStress: number;       // 0-30 bonus for extreme heat
  windRisk: number;         // 0-30 bonus for high winds
  precipRisk: number;       // 0-30 bonus for heavy precipitation
  stormRisk: number;        // 0-20 bonus for thunderstorm codes
  explanation: string;
}

export function computeWeatherAdjustment(hourly: WeatherForecastHour[]): WeatherRiskAdjustment {
  if (hourly.length === 0) {
    return { heatStress: 0, windRisk: 0, precipRisk: 0, stormRisk: 0, explanation: 'No forecast data available' };
  }

  // Look at next 72 hours max
  const forecast = hourly.slice(0, 72);

  const maxTemp = Math.max(...forecast.map(h => h.temperature));
  const maxWind = Math.max(...forecast.map(h => h.windSpeed));
  const maxPrecipProb = Math.max(...forecast.map(h => h.precipitationProbability));
  const hasThunderstorm = forecast.some(h => h.weatherCode >= 95);

  // Heat stress: >35°C starts adding risk, >45°C is extreme
  const heatStress = maxTemp > 35 ? Math.min(30, Math.round((maxTemp - 35) * 3)) : 0;

  // Wind risk: >60 km/h starts adding, >100 km/h is severe
  const windRisk = maxWind > 60 ? Math.min(30, Math.round((maxWind - 60) * 0.75)) : 0;

  // Precipitation risk: high probability of rain increases flood risk
  const precipRisk = maxPrecipProb > 70 ? Math.min(30, Math.round((maxPrecipProb - 70) * 1.0)) : 0;

  // Storm risk: thunderstorm codes
  const stormRisk = hasThunderstorm ? 15 : 0;

  const parts: string[] = [];
  if (heatStress > 0) parts.push(`Extreme heat forecast (max ${maxTemp}°C)`);
  if (windRisk > 0) parts.push(`High winds forecast (max ${maxWind} km/h)`);
  if (precipRisk > 0) parts.push(`High precipitation probability (${maxPrecipProb}%)`);
  if (stormRisk > 0) parts.push('Thunderstorm activity forecast');

  return {
    heatStress,
    windRisk,
    precipRisk,
    stormRisk,
    explanation: parts.length > 0 ? parts.join('; ') : 'No extreme weather forecast',
  };
}
