const appName = "Gdzie ta koperta?";
const appSlug = "gdzie-ta-koperta-mobile";
const appScheme = "gdzietakoperta";
const appId = "pl.gdzietakoperta.app";

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  return {
    ...config,
    name: appName,
    slug: appSlug,
    scheme: appScheme,
    version: config.version || "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    ios: {
      ...config.ios,
      bundleIdentifier: appId,
      buildNumber: "1",
      supportsTablet: true,
      infoPlist: {
        ...(config.ios?.infoPlist || {}),
        NSLocationWhenInUseUsageDescription:
          "Aplikacja używa lokalizacji, aby pokazać Twoją pozycję, znaleźć kopertę przy celu podróży i umożliwić dodanie nowej koperty."
      }
    },

    android: {
      ...config.android,
      package: appId,
      versionCode: 1,
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION"
      ],
      config: {
        ...(config.android?.config || {}),
        ...(googleMapsApiKey
          ? {
              googleMaps: {
                apiKey: googleMapsApiKey
              }
            }
          : {})
      }
    },

    plugins: config.plugins || [],

    extra: {
      ...(config.extra || {}),
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL
    }
  };
};
