"use client";

import { useEffect, useState } from "react";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

export default function ContactMap() {
  const [MapComponent, setMapComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    // Fix z-index Leaflet sous la navbar
    const style = document.createElement("style");
    style.textContent = `
      .leaflet-pane, 
      .leaflet-top, 
      .leaflet-bottom { z-index: 0 !important; } 
      .leaflet-control { z-index: 0 !important; }
    `;
    document.head.appendChild(style);

    // CSS Leaflet
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Import dynamique (évite erreur SSR)
    Promise.all([
      import("react-leaflet"),
      import("leaflet"),
    ]).then(([{ MapContainer, TileLayer, Marker, Popup }, L]) => {
      // Fix icône Leaflet avec Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const position: [number, number] = [36.7538, 3.0588];

      const Map = () => (
        <MapContainer
          center={position}
          zoom={13}
          style={{
            height: "100%",
            width: "100%",
            borderRadius: "0.75rem",
            zIndex: 0,
          }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={position}>
            <Popup>
              <div className="text-sm font-medium">TAYSIR COMPTA</div>
              <div className="text-xs text-gray-500">Alger, Algérie</div>
            </Popup>
          </Marker>
        </MapContainer>
      );

      setMapComponent(() => Map);
    });

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Carte */}
      <div
        className="h-78 w-full rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-gray-100"
        style={{ position: "relative", zIndex: 0 }}
      >
        {MapComponent ? (
          <MapComponent />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
              Chargement de la carte...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}