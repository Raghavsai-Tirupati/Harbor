// Google Maps API Key (client-side, protected by domain restrictions in Google Cloud Console)
// Ensure HTTP referrer restrictions are set to: *.lovable.app/*, *.lovableproject.com/*
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// If you need to hardcode the key (when env var is not available), uncomment and add your key:
// export const GOOGLE_MAPS_API_KEY = 'YOUR_API_KEY_HERE';
