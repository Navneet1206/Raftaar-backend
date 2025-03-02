const axios = require('axios');
const https = require('https');
const captainModel = require('../models/captain.model');
require('dotenv').config();

// Set up Axios options with a 15-second timeout.
let axiosOptions = {
  timeout: 15000, // 15-second timeout
};

if (typeof window === 'undefined') {
  axiosOptions.httpsAgent = new https.Agent({ family: 4 });
  axiosOptions.headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; YourAppName/1.0; +http://yourdomain.com/info)'
  };
}

const axiosInstance = axios.create(axiosOptions);

// Helper function to geocode an address using Nominatim
async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
  const response = await axiosInstance.get(url);
  if (response.data && response.data.length > 0) {
    const result = response.data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      formatted_address: result.display_name
    };
  } else {
    throw new Error('Unable to fetch coordinates for the address');
  }
}

// Helper function to reverse geocode using Nominatim
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const response = await axiosInstance.get(url);
  if (response.data && response.data.display_name) {
    return {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      formatted_address: response.data.display_name
    };
  } else {
    throw new Error('Unable to fetch address for the given coordinates');
  }
}

module.exports.getAddressCoordinate = async (input) => {
  const trimmedInput = input.trim();

  // Check if the input is a lat,lng pair (reverse geocoding) or an address.
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(trimmedInput)) {
    // Reverse geocoding: split the input into lat and lng.
    const [lat, lng] = trimmedInput.split(',').map(Number);
    console.log('[maps.service] Reverse geocoding using Nominatim');
    try {
      const result = await reverseGeocode(lat, lng);
      return {
        ltd: result.lat,
        lng: result.lng,
        formatted_address: result.formatted_address,
      };
    } catch (error) {
      console.error('[maps.service] Error:', error.message);
      throw error;
    }
  } else {
    // Forward geocoding: treat input as address.
    console.log('[maps.service] Forward geocoding using Nominatim');
    try {
      const result = await geocodeAddress(trimmedInput);
      return {
        ltd: result.lat,
        lng: result.lng,
        formatted_address: result.formatted_address,
      };
    } catch (error) {
      console.error('[maps.service] Error:', error.message);
      throw error;
    }
  }
};

module.exports.getDistanceTime = async (origin, destination) => {
  if (!origin || !destination) {
    throw new Error('Origin and destination are required');
  }

  let originCoords, destinationCoords;

  // Determine if origin is coordinates or address.
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(origin.trim())) {
    const [lat, lng] = origin.trim().split(',').map(Number);
    originCoords = { lat, lng };
  } else {
    originCoords = await geocodeAddress(origin);
  }

  // Determine if destination is coordinates or address.
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(destination.trim())) {
    const [lat, lng] = destination.trim().split(',').map(Number);
    destinationCoords = { lat, lng };
  } else {
    destinationCoords = await geocodeAddress(destination);
  }

  // Use OSRM API for routing.
  const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?overview=false`;
  console.log('[maps.service] Request OSRM URL:', osrmUrl);

  try {
    const response = await axiosInstance.get(osrmUrl);
    if (response.data && response.data.code === 'Ok' && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      // Return distance (in meters) and duration (in seconds)
      return {
        distance: route.distance,
        duration: route.duration
      };
    } else {
      throw new Error('Unable to fetch distance and time');
    }
  } catch (err) {
    console.error('[maps.service] Error in getDistanceTime:', err.message);
    throw err;
  }
};

module.exports.getAutoCompleteSuggestions = async (input) => {
  if (!input) {
    throw new Error('Input is required');
  }

  // Nominatim does not have a dedicated autocomplete API.
  // Using the search endpoint to simulate autocomplete suggestions.
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(input)}`;
  console.log('[maps.service] Request autocomplete URL:', url);

  try {
    const response = await axiosInstance.get(url);
    if (response.data) {
      // Map the results to their display_name for suggestions.
      return response.data.map(result => result.display_name);
    } else {
      throw new Error('Unable to fetch suggestions');
    }
  } catch (err) {
    console.error('[maps.service] Error in getAutoCompleteSuggestions:', err.message);
    throw err;
  }
};

module.exports.getCaptainsInTheRadius = async (lat, lng, radius) => {
  try {
    const captains = await captainModel.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: radius * 1000, // Convert km to meters
        },
      },
    });
    return captains;
  } catch (err) {
    console.error('[maps.service] Error in getCaptainsInTheRadius:', err.message);
    throw new Error('Unable to fetch captains in the radius');
  }
};
