import type { MetadataRoute } from "next";

/**
 * Manifiesto para que Market Analyzer se pueda instalar en el teléfono o en el
 * escritorio y abra sin la barra del navegador.
 *
 * No lleva service worker a propósito. Desde Chrome 108 en Android y 112 en
 * escritorio ya no hace falta uno para que salga "Instalar app" en el menú, y
 * en iOS "Agregar a pantalla de inicio" nunca lo pidió. Un service worker se
 * queda guardado en el navegador de cada usuario e intercepta todas las
 * peticiones aunque no haga nada, y para quitarlo después no basta con borrar
 * el archivo: hay que publicar una versión que se desregistre sola. Aquí no
 * aportaría nada —ninguna pantalla sirve sin datos del mercado en vivo, así que
 * no hay nada que valga la pena guardar fuera de línea— y por eso se deja fuera
 * (AC Consulting, 2026-10-30).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Identidad fija de la app instalada. Si algún día cambia `start_url`, el
    // sistema la sigue reconociendo como la misma y no instala una segunda.
    id: "/market-analyzer",
    name: "Market Analyzer — AC Consulting",
    short_name: "Market Analyzer",
    description:
      "Inteligencia de compensación y análisis del mercado salarial — AC Consulting",
    lang: "es",
    dir: "ltr",
    start_url: "/market-analyzer/inicio",
    // Todo el dominio queda dentro de la ventana de la app; si fuera solo
    // /market-analyzer, un enlace a la página institucional saltaría al
    // navegador.
    scope: "/",
    display: "standalone",
    background_color: "#ECF0F1",
    theme_color: "#1B4965",
    icons: [
      { src: "/ma-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ma-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android recorta el ícono con la forma del lanzador (círculo, gota,
      // cuadrado). Esta versión trae el dibujo más adentro para que no se corte.
      { src: "/ma-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
