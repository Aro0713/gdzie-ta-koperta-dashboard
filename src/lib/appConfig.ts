export const appConfig = {
  name: "Gdzie ta koperta?",
  mission:
    "Dostępność nie może być teorią. Musi być dla ludzi, musi być realna i musi działać wtedy, kiedy ktoś naprawdę jej potrzebuje.",
  defaultCenter: {
    lat: 52.237049,
    lng: 21.017532,
    zoom: 12
  },
  tileUrl:
    process.env.NEXT_PUBLIC_TILE_URL ||
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution:
    process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
    "&copy; OpenStreetMap contributors"
};
