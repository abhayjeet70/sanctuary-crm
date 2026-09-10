/** Every image in the product, in one place.
 *  Phase 2: these become Supabase Storage URLs; nothing else changes. */

export const logo = {
  /** Dark plate — for use on sand and paper surfaces. */
  onLight: "/logo2.png",
  /** Ink plate — for use on the ink header and hero overlays. */
  onDark: "/logo1.png",
};

export const photo = {
  hills: "/villas/nandi-hills.png",
  maaya: "/villas/villa-maya.png",
  praana: "/villas/villa-prana.png",
  nirvaana: "/villas/villa-norvana.png",
};

/** The four property photographs, for collages and galleries. */
export const collage = [
  { src: photo.maaya, alt: "The bamboo-screened western face of Villa Maaya" },
  { src: photo.hills, alt: "Cloud breaking over the Nandi Hills escarpment at dawn" },
  { src: photo.praana, alt: "Villa Praana seen across its water court" },
  { src: photo.nirvaana, alt: "The colonnade and orchard walk at Villa Nirvaana" },
];

/** Menu and receipt imagery has no photography yet — seeded placeholders keep
 *  the layouts honest until the kitchen shoot happens. */
export const placeholder = (seed: string, w = 800, h = 600) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;
