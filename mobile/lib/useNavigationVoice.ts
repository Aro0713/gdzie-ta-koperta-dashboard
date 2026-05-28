import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useState } from "react";

import {
  hasNavigationVoiceCommand,
  navigationVoicePack,
  type NavigationVoiceCommandId
} from "./navigationVoiceManifest";

export function useNavigationVoice() {
  const player = useAudioPlayer(null);
  const [lastCommandId, setLastCommandId] =
    useState<NavigationVoiceCommandId | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "duckOthers"
    }).catch((error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Nie udało się skonfigurować audio.";

      setVoiceError(message);
    });
  }, []);

  const playVoiceCommand = useCallback(
    (id: string) => {
      if (!hasNavigationVoiceCommand(id)) {
        setVoiceError(`Brak nagrania dla komendy: ${id}`);
        return false;
      }

      try {
        const source = navigationVoicePack.commands[id];

        player.pause();
        player.replace(source);
        player.play();

        setLastCommandId(id);
        setVoiceError(null);

        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Nie udało się odtworzyć komunikatu.";

        setVoiceError(message);

        return false;
      }
    },
    [player]
  );

  return {
    playVoiceCommand,
    lastCommandId,
    voiceError
  };
}