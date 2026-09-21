import type { NextConfig } from "next";

const securityHeaders = [
  // Fuerza HTTPS por 2 años en navegadores
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Evita que la app sea embebida en iframes (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Evita MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Controla info enviada en el Referer
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deshabilita permisos de hardware innecesarios
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Las plantillas de los informes son archivos .xlsx que la ruta lee del disco.
  // Sin esto, el rastreo de dependencias de Next no las ve (nadie las importa)
  // y no viajan en el bundle de la función al desplegar.
  outputFileTracingIncludes: {
    "/api/estudio/informe-cortesia": ["./templates/**"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
