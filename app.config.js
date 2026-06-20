try {
  require('dotenv').config();
} catch (error) {
  // dotenv is optional; environment variables may still be provided by the shell or CI.
}

const appJson = require("./app.json");

module.exports = ({ config }) => {
  return {
    expo: {
      ...appJson.expo,
      extra: {
        ...(appJson.expo.extra || {}),
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        GROQ_API_KEY: process.env.GROQ_API_KEY || '',
        GROK_API_KEY: process.env.GROK_API_KEY || '',
      },
    },
  };
};
