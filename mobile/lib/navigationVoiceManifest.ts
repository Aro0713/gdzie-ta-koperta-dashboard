declare const require: (path: string) => number;

export const navigationVoicePack = {
  id: "lukasz-kwasny-pl",
  speaker: "Lukasz Kwasny",
  locale: "pl-PL",
  format: "wav",
  basePath: "assets/audio/navigation/pl/lukasz-kwasny",
  commands: {
    "arrival_at_destination": require("../assets/audio/navigation/pl/lukasz-kwasny/arrival_at_destination.wav"),
    "arrival_at_parking": require("../assets/audio/navigation/pl/lukasz-kwasny/arrival_at_parking.wav"),
    "arrival_finish_navigation": require("../assets/audio/navigation/pl/lukasz-kwasny/arrival_finish_navigation.wav"),
    "arrival_near_parking": require("../assets/audio/navigation/pl/lukasz-kwasny/arrival_near_parking.wav"),
    "gtk_found_destination": require("../assets/audio/navigation/pl/lukasz-kwasny/gtk_found_destination.wav"),
    "gtk_found_parking": require("../assets/audio/navigation/pl/lukasz-kwasny/gtk_found_parking.wav"),
    "nav_at_intersection_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_at_intersection_left.wav"),
    "nav_at_intersection_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_at_intersection_right.wav"),
    "nav_at_intersection_straight": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_at_intersection_straight.wav"),
    "nav_at_next_intersection_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_at_next_intersection_left.wav"),
    "nav_at_next_intersection_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_at_next_intersection_right.wav"),
    "nav_continue_straight": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_continue_straight.wav"),
    "nav_cross_intersection": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_cross_intersection.wav"),
    "nav_destination_needed": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_destination_needed.wav"),
    "nav_fork_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_fork_left.wav"),
    "nav_fork_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_fork_right.wav"),
    "nav_keep_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_keep_left.wav"),
    "nav_keep_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_keep_right.wav"),
    "nav_make_uturn": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_make_uturn.wav"),
    "nav_navigation_start": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_navigation_start.wav"),
    "nav_navigation_stop": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_navigation_stop.wav"),
    "nav_roundabout_after_exit_continue": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_after_exit_continue.wav"),
    "nav_roundabout_enter": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_enter.wav"),
    "nav_roundabout_exit_1": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_1.wav"),
    "nav_roundabout_exit_2": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_2.wav"),
    "nav_roundabout_exit_3": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_3.wav"),
    "nav_roundabout_exit_4": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_exit_4.wav"),
    "nav_roundabout_prepare_exit": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_roundabout_prepare_exit.wav"),
    "nav_route_calculating": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_route_calculating.wav"),
    "nav_route_ready": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_route_ready.wav"),
    "nav_searching_destination": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_searching_destination.wav"),
    "nav_searching_parking": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_searching_parking.wav"),
    "nav_sharp_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_sharp_left.wav"),
    "nav_sharp_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_sharp_right.wav"),
    "nav_slight_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_slight_left.wav"),
    "nav_slight_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_slight_right.wav"),
    "nav_take_exit": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_take_exit.wav"),
    "nav_take_exit_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_take_exit_left.wav"),
    "nav_take_exit_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_take_exit_right.wav"),
    "nav_take_next_exit": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_take_next_exit.wav"),
    "nav_turn_left": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_turn_left.wav"),
    "nav_turn_right": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_turn_right.wav"),
    "nav_use_left_lane": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_use_left_lane.wav"),
    "nav_use_right_lane": require("../assets/audio/navigation/pl/lukasz-kwasny/nav_use_right_lane.wav"),
    "route_gps_lost": require("../assets/audio/navigation/pl/lukasz-kwasny/route_gps_lost.wav"),
    "route_gps_restored": require("../assets/audio/navigation/pl/lukasz-kwasny/route_gps_restored.wav"),
    "route_network_error": require("../assets/audio/navigation/pl/lukasz-kwasny/route_network_error.wav"),
    "route_no_destination_found": require("../assets/audio/navigation/pl/lukasz-kwasny/route_no_destination_found.wav"),
    "route_no_route_found": require("../assets/audio/navigation/pl/lukasz-kwasny/route_no_route_found.wav"),
    "route_off_track": require("../assets/audio/navigation/pl/lukasz-kwasny/route_off_track.wav"),
    "route_recalculated": require("../assets/audio/navigation/pl/lukasz-kwasny/route_recalculated.wav"),
    "route_recalculating": require("../assets/audio/navigation/pl/lukasz-kwasny/route_recalculating.wav"),
    "route_try_more_precise_address": require("../assets/audio/navigation/pl/lukasz-kwasny/route_try_more_precise_address.wav"),
  }
} as const;

export type NavigationVoiceCommandId = keyof typeof navigationVoicePack.commands;

export const navigationVoiceCommandIds = Object.keys(
  navigationVoicePack.commands
) as NavigationVoiceCommandId[];

export function hasNavigationVoiceCommand(
  id: string
): id is NavigationVoiceCommandId {
  return id in navigationVoicePack.commands;
}
