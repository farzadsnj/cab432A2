const axios = require('axios');

async function getWeatherData(city) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenWeather API key is not set.');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
    city
  )}&units=metric&appid=${apiKey}`;

  try {
    const response = await axios.get(url);
    const data = response.data;
    // Extract the data you need
    const weatherInfo = {
      city: data.name,
      temperature: data.main.temp,
      description: data.weather[0].description,
      icon: data.weather[0].icon,
    };
    return weatherInfo;
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
    throw error;
  }
}

module.exports = {
  getWeatherData,
};
