export const webNavigationVoicePack = {
  id: "lukasz-kwasny-pl-web",
  speaker: "Lukasz Kwasny",
  locale: "pl-PL",
  format: "wav",
  commands: {
  "arrival_at_destination": "/audio/navigation/pl/lukasz-kwasny/arrival_at_destination.wav",
  "arrival_at_parking": "/audio/navigation/pl/lukasz-kwasny/arrival_at_parking.wav",
  "arrival_finish_navigation": "/audio/navigation/pl/lukasz-kwasny/arrival_finish_navigation.wav",
  "arrival_near_parking": "/audio/navigation/pl/lukasz-kwasny/arrival_near_parking.wav",
  "gtk_found_destination": "/audio/navigation/pl/lukasz-kwasny/gtk_found_destination.wav",
  "gtk_found_parking": "/audio/navigation/pl/lukasz-kwasny/gtk_found_parking.wav",
  "nav_at_intersection_left": "/audio/navigation/pl/lukasz-kwasny/nav_at_intersection_left.wav",
  "nav_at_intersection_right": "/audio/navigation/pl/lukasz-kwasny/nav_at_intersection_right.wav",
  "nav_at_intersection_straight": "/audio/navigation/pl/lukasz-kwasny/nav_at_intersection_straight.wav",
  "nav_at_next_intersection_left": "/audio/navigation/pl/lukasz-kwasny/nav_at_next_intersection_left.wav",
  "nav_at_next_intersection_right": "/audio/navigation/pl/lukasz-kwasny/nav_at_next_intersection_right.wav",
  "nav_continue_straight": "/audio/navigation/pl/lukasz-kwasny/nav_continue_straight.wav",
  "nav_cross_intersection": "/audio/navigation/pl/lukasz-kwasny/nav_cross_intersection.wav",
  "nav_destination_needed": "/audio/navigation/pl/lukasz-kwasny/nav_destination_needed.wav",
  "nav_fork_left": "/audio/navigation/pl/lukasz-kwasny/nav_fork_left.wav",
  "nav_fork_right": "/audio/navigation/pl/lukasz-kwasny/nav_fork_right.wav",
  "nav_keep_left": "/audio/navigation/pl/lukasz-kwasny/nav_keep_left.wav",
  "nav_keep_right": "/audio/navigation/pl/lukasz-kwasny/nav_keep_right.wav",
  "nav_make_uturn": "/audio/navigation/pl/lukasz-kwasny/nav_make_uturn.wav",
  "nav_navigation_start": "/audio/navigation/pl/lukasz-kwasny/nav_navigation_start.wav",
  "nav_navigation_stop": "/audio/navigation/pl/lukasz-kwasny/nav_navigation_stop.wav",
  "nav_roundabout_after_exit_continue": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_after_exit_continue.wav",
  "nav_roundabout_enter": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_enter.wav",
  "nav_roundabout_exit_1": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_1.wav",
  "nav_roundabout_exit_2": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_2.wav",
  "nav_roundabout_exit_3": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_3.wav",
  "nav_roundabout_exit_4": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_4.wav",
  "nav_roundabout_prepare_exit": "/audio/navigation/pl/lukasz-kwasny/nav_roundabout_prepare_exit.wav",
  "nav_route_calculating": "/audio/navigation/pl/lukasz-kwasny/nav_route_calculating.wav",
  "nav_route_ready": "/audio/navigation/pl/lukasz-kwasny/nav_route_ready.wav",
  "nav_searching_destination": "/audio/navigation/pl/lukasz-kwasny/nav_searching_destination.wav",
  "nav_searching_parking": "/audio/navigation/pl/lukasz-kwasny/nav_searching_parking.wav",
  "nav_sharp_left": "/audio/navigation/pl/lukasz-kwasny/nav_sharp_left.wav",
  "nav_sharp_right": "/audio/navigation/pl/lukasz-kwasny/nav_sharp_right.wav",
  "nav_slight_left": "/audio/navigation/pl/lukasz-kwasny/nav_slight_left.wav",
  "nav_slight_right": "/audio/navigation/pl/lukasz-kwasny/nav_slight_right.wav",
  "nav_take_exit_left": "/audio/navigation/pl/lukasz-kwasny/nav_take_exit_left.wav",
  "nav_take_exit_right": "/audio/navigation/pl/lukasz-kwasny/nav_take_exit_right.wav",
  "nav_take_exit": "/audio/navigation/pl/lukasz-kwasny/nav_take_exit.wav",
  "nav_take_next_exit": "/audio/navigation/pl/lukasz-kwasny/nav_take_next_exit.wav",
  "nav_turn_left": "/audio/navigation/pl/lukasz-kwasny/nav_turn_left.wav",
  "nav_turn_right": "/audio/navigation/pl/lukasz-kwasny/nav_turn_right.wav",
  "nav_use_left_lane": "/audio/navigation/pl/lukasz-kwasny/nav_use_left_lane.wav",
  "nav_use_right_lane": "/audio/navigation/pl/lukasz-kwasny/nav_use_right_lane.wav",
  "route_gps_lost": "/audio/navigation/pl/lukasz-kwasny/route_gps_lost.wav",
  "route_gps_restored": "/audio/navigation/pl/lukasz-kwasny/route_gps_restored.wav",
  "route_network_error": "/audio/navigation/pl/lukasz-kwasny/route_network_error.wav",
  "route_no_destination_found": "/audio/navigation/pl/lukasz-kwasny/route_no_destination_found.wav",
  "route_no_route_found": "/audio/navigation/pl/lukasz-kwasny/route_no_route_found.wav",
  "route_off_track": "/audio/navigation/pl/lukasz-kwasny/route_off_track.wav",
  "route_recalculated": "/audio/navigation/pl/lukasz-kwasny/route_recalculated.wav",
  "route_recalculating": "/audio/navigation/pl/lukasz-kwasny/route_recalculating.wav",
  "route_try_more_precise_address": "/audio/navigation/pl/lukasz-kwasny/route_try_more_precise_address.wav",
  }
} as const;

export type WebNavigationVoiceCommandId =
  keyof typeof webNavigationVoicePack.commands;

export type WebNavigationVoiceResult =
  | {
      ok: true;
      commandId: WebNavigationVoiceCommandId;
    }
  | {
      ok: false;
      commandId: WebNavigationVoiceCommandId;
      error: string;
    };

let currentAudio: HTMLAudioElement | null = null;

function getAudioElement() {
  if (!currentAudio) {
    currentAudio = new Audio();
    currentAudio.preload = "auto";
  }

  return currentAudio;
}

export function getWebNavigationVoiceUrl(commandId: WebNavigationVoiceCommandId) {
  return webNavigationVoicePack.commands[commandId];
}

export async function playWebNavigationVoiceCommand(
  commandId: WebNavigationVoiceCommandId
): Promise<WebNavigationVoiceResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      commandId,
      error: "Audio przeglądarkowe jest dostępne tylko po stronie klienta."
    };
  }

  try {
    const audio = getAudioElement();
    const source = getWebNavigationVoiceUrl(commandId);

    audio.pause();
    audio.currentTime = 0;
    audio.src = source;
    audio.load();

    await audio.play();

    return {
      ok: true,
      commandId
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nie udało się odtworzyć komunikatu głosowego.";

    return {
      ok: false,
      commandId,
      error: message
    };
  }
}

export function stopWebNavigationVoice() {
  if (!currentAudio) {
    return;
  }

  currentAudio.pause();
  currentAudio.currentTime = 0;
}
