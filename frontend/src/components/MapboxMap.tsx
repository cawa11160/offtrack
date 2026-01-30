import Map from "react-map-gl";

export default function MapboxMap() {
  const token = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim();

  if (!token) {
    return <div>Mapbox token missing</div>;
  }

  return (
    <Map
      mapboxAccessToken={token}
      initialViewState={{
        latitude: 37.7749,
        longitude: -122.4194,
        zoom: 10,
      }}
      style={{ width: "100%", height: 500 }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    />
  );
}
