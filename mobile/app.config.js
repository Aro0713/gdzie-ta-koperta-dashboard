const appName = "Gdzie ta koperta?";
const appSlug = "gdzie-ta-koperta-mobile";
const appScheme = "gdzietakoperta";
const appId = "pl.gdzietakoperta.app";

module.exports = ({ config }) => {
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
          "Aplikacja używa lokalizacji, aby pokazać Twoją pozycję, znaleźć kopertę przy celu podróży i umożliwić dodanie nowej koperty.",
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription:
          "Aplikacja używa mikrofonu, aby umożliwić głosowe wpisanie celu podróży.",
        NSSpeechRecognitionUsageDescription:
          "Aplikacja używa rozpoznawania mowy, aby wpisać cel podróży głosem."
      }
    },

    android: {
      ...config.android,
      package: appId,
      versionCode: 1,
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "RECORD_AUDIO"
      ]
    },

    plugins: Array.from(
      new Set([
        ...(config.plugins || []),
        "@maplibre/maplibre-react-native",
        "expo-speech-recognition"
      ])
    ),

    extra: {
      ...(config.extra || {}),
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_BASE_URL ||
        "https://www.gdzietakoperta.pl"
    }
  };
};