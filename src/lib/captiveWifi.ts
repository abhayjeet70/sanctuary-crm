import type { ControllerVendor } from "@/services/wifi/types";

/**
 * Captive Wi-Fi planning: what to buy, what to allow through before sign-in,
 * and how each supported controller is set up.
 *
 * Pure functions, no network, so the numbers are testable. Product names are
 * EXAMPLES of each vendor's line-up to shop from — model names change, so
 * check current availability. Quantities and rules of thumb are ours.
 */

export const VENDORS: Record<
  ControllerVendor,
  { label: string; blurb: string; portalApi: string }
> = {
  mock: {
    label: "Mock (no hardware)",
    blurb: "Records decisions in the CRM only. Use while the network is being installed.",
    portalApi: "None",
  },
  unifi: {
    label: "UniFi (Ubiquiti)",
    blurb:
      "Easiest to run: one console manages every villa, and it has a first-class external-portal flow.",
    portalApi: "Guest authorisation over the UniFi Network API (local admin login)",
  },
  omada: {
    label: "TP-Link Omada",
    blurb: "Good value, similar model to UniFi. External Portal Server API with a hotspot operator account.",
    portalApi: "External Portal Server API (hotspot operator login)",
  },
  mikrotik: {
    label: "MikroTik",
    blurb:
      "Cheapest and most flexible, but needs a network engineer. Hotspot on RouterOS 7, driven over the REST API.",
    portalApi: "RouterOS 7 REST API (hotspot bypass bindings)",
  },
};

/* -------------------------------------------------------------- hardware */

export interface VillaInput {
  name: string;
  bedrooms: number;
  /** Guests the villa sleeps. Sizes the internet link. */
  capacity: number;
  /** Access points already installed, if any. */
  installedAps?: number;
}

export interface PlanOptions {
  vendor: ControllerVendor;
  /** Verandahs, pools and gardens that need their own outdoor access point. */
  outdoorZonesPerVilla?: number;
  /** A second internet line (4G/5G or another ISP) for when the first fails. */
  failover?: boolean;
}

export interface PlanLine {
  item: string;
  quantity: number;
  /** What it is for and the rule used to size it. */
  why: string;
  /** Example products from the chosen vendor's range. */
  examples: string;
  /** Already covered by what is installed. */
  have?: number;
}

export interface VillaPlan {
  name: string;
  indoorAps: number;
  outdoorAps: number;
  totalAps: number;
  installed: number;
  toBuy: number;
  switchPorts: number;
}

export interface HardwarePlan {
  perVilla: VillaPlan[];
  lines: PlanLine[];
  totalAps: number;
  /** Recommended internet speed for the whole property, Mbps. */
  recommendedMbps: number;
  notes: string[];
}

/**
 * Rules of thumb, stated so they can be argued with:
 *  - Stone and thick plaster stop 5 GHz. One indoor AP per TWO bedrooms, never
 *    fewer than one, so no bedroom is more than one wall from an AP.
 *  - Guests sit outside: one outdoor AP per verandah/pool zone.
 *  - A guest carries about 3 devices (phone, laptop or tablet, watch/TV); with
 *    half of them active at once and ~3 Mbps each, that is the link needed.
 */
const DEVICES_PER_GUEST = 3;
const ACTIVE_SHARE = 0.5;
const MBPS_PER_ACTIVE_DEVICE = 3;

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

const EXAMPLES: Record<
  ControllerVendor,
  { gateway: string; controller: string; indoor: string; outdoor: string; poe8: string; poe16: string }
> = {
  mock: { gateway: "—", controller: "—", indoor: "—", outdoor: "—", poe8: "—", poe16: "—" },
  unifi: {
    gateway: "UniFi Cloud Gateway (Ultra / Max) or Dream Machine — runs the controller too",
    controller: "Built into the gateway; no extra box",
    indoor: "UniFi U6/U7 ceiling access point (Lite, Pro)",
    outdoor: "UniFi outdoor access point (U6/U7 Mesh or Outdoor)",
    poe8: "UniFi Switch Lite 8 PoE",
    poe16: "UniFi Switch 16 PoE / Pro 24 PoE",
  },
  omada: {
    gateway: "Omada ER605 / ER7206 router",
    controller: "OC200 / OC300 hardware controller (or Omada software on a small always-on PC)",
    indoor: "Omada EAP ceiling access point (e.g. EAP610 / EAP650)",
    outdoor: "Omada outdoor access point (e.g. EAP610-Outdoor)",
    poe8: "Omada 8-port PoE+ switch (e.g. TL-SG2008P)",
    poe16: "Omada 16-port PoE+ switch (e.g. TL-SG2218P)",
  },
  mikrotik: {
    gateway: "MikroTik RB5009 / hEX S (RouterOS 7, hotspot licence included)",
    controller: "None — the router is the controller; add CAPsMAN for centrally managed access points",
    indoor: "MikroTik cAP ax / hAP ax (managed with CAPsMAN)",
    outdoor: "MikroTik wAP ax or a weatherproof outdoor unit",
    poe8: "MikroTik CSS610-8P-2S+IN or CRS112-8P-4S-IN",
    poe16: "MikroTik CRS318-16P-2S+",
  },
};

export function hardwarePlan(villas: VillaInput[], opts: PlanOptions): HardwarePlan {
  const outdoorZones = Math.max(0, opts.outdoorZonesPerVilla ?? 1);
  const ex = EXAMPLES[opts.vendor];

  const perVilla: VillaPlan[] = villas.map((v) => {
    const indoorAps = Math.max(1, Math.ceil(v.bedrooms / 2));
    const outdoorAps = outdoorZones;
    const totalAps = indoorAps + outdoorAps;
    const installed = Math.max(0, v.installedAps ?? 0);
    return {
      name: v.name,
      indoorAps,
      outdoorAps,
      totalAps,
      installed,
      toBuy: Math.max(0, totalAps - installed),
      // every AP, the uplink, and two spare so a camera or TV can be added
      switchPorts: totalAps + 3,
    };
  });

  const totalAps = perVilla.reduce((n, v) => n + v.totalAps, 0);
  const indoorTotal = perVilla.reduce((n, v) => n + v.indoorAps, 0);
  const outdoorTotal = perVilla.reduce((n, v) => n + v.outdoorAps, 0);
  const guests = villas.reduce((n, v) => n + v.capacity, 0);
  const recommendedMbps = Math.max(
    50,
    roundUp(guests * DEVICES_PER_GUEST * ACTIVE_SHARE * MBPS_PER_ACTIVE_DEVICE, 50),
  );

  const lines: PlanLine[] = [
    {
      item: "Gateway / router",
      quantity: 1,
      why: "One per property. Terminates the internet line, separates the guest network from staff, and enforces the sign-in wall.",
      examples: ex.gateway,
    },
  ];

  if (opts.vendor !== "mock") {
    lines.push({
      item: "Network controller",
      quantity: 1,
      why: "The brain the CRM talks to. The CRM decides who is allowed; this makes the network obey.",
      examples: ex.controller,
    });
  }

  lines.push(
    {
      item: "Indoor ceiling access points",
      quantity: indoorTotal,
      why: "One per two bedrooms per villa (minimum one). Thick stone walls stop 5 GHz, so fewer, stronger points do worse than this.",
      examples: ex.indoor,
      have: villas.reduce((n, v) => n + Math.min(v.installedAps ?? 0, Math.max(1, Math.ceil(v.bedrooms / 2))), 0),
    },
    {
      item: "Outdoor access points",
      quantity: outdoorTotal,
      why: `${outdoorZones} per villa for the verandah / pool / garden, where guests actually sit.`,
      examples: ex.outdoor,
    },
  );

  for (const v of perVilla) {
    lines.push({
      item: `PoE switch — ${v.name}`,
      quantity: 1,
      why: `${v.switchPorts} ports needed (${v.totalAps} access points, 1 uplink, 2 spare). Powers the access points over the cable.`,
      examples: v.switchPorts <= 8 ? ex.poe8 : ex.poe16,
    });
  }

  lines.push(
    {
      item: "UPS (uninterruptible power)",
      quantity: villas.length + 1,
      why: "One per villa rack and one at the gateway. A power blink otherwise drops every guest and can leave the gateway corrupted.",
      examples: "600–1000 VA line-interactive UPS",
    },
    {
      item: "Cat6 cable, outdoor-rated between buildings",
      quantity: totalAps,
      why: "About one run per access point (roughly 30 m each). Copper is limited to 100 m; farther runs between villas need fibre or a PoE extender.",
      examples: "Cat6 (UV-rated outdoors), keystone jacks, patch leads, a small wall rack per villa",
    },
    {
      item: "Weatherproof enclosures & surge protection",
      quantity: villas.length,
      why: "Monsoon and lightning on a hill site. One sealed cabinet with surge arrestors per villa where cables run outside.",
      examples: "IP65 cabinet, Ethernet surge protectors",
    },
  );

  if (opts.failover) {
    lines.push({
      item: "Failover internet line",
      quantity: 1,
      why: "A second ISP or a 4G/5G router so a fibre cut does not switch every villa off at once. Most gateways fail over automatically.",
      examples: "Second ISP link, or a 5G router with an external antenna",
    });
  }

  const notes = [
    `Internet: about ${recommendedMbps} Mbps for ${guests} guests at full occupancy (${DEVICES_PER_GUEST} devices each, half active at once, ~${MBPS_PER_ACTIVE_DEVICE} Mbps per active device). More if guests stream 4K or work remotely.`,
    "Put guest Wi-Fi on its own VLAN with client isolation on, so a guest cannot see another guest's devices or your staff and CCTV network.",
    "Run the controller on the same site as the gateway, and reach it from the CRM over HTTPS on a real domain (or a tunnel). A self-signed certificate will not pass the edge function.",
    "Survey before drilling: walk each villa with a phone and a Wi-Fi analyser app. Stone, steel doors and the pool tiles move where an access point should really sit.",
  ];
  if (villas.length > 1) {
    notes.push(
      "Villas are separate buildings: link each rack back to the gateway with outdoor fibre (or a wireless bridge as a stop-gap) — do not rely on Wi-Fi mesh between houses.",
    );
  }

  return { perVilla, lines, totalAps, recommendedMbps, notes };
}

/* ---------------------------------------------------------- walled garden */

/**
 * What a phone must reach BEFORE it is signed in. Block any of these and the
 * sign-in page never opens (or opens only on some phones).
 */
export interface WalledGardenEntry {
  host: string;
  why: string;
}

export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host;
  } catch {
    return "";
  }
}

export function walledGarden(portalUrl: string, supabaseUrl: string): WalledGardenEntry[] {
  const portal = hostOf(portalUrl);
  const supabase = hostOf(supabaseUrl);
  const list: WalledGardenEntry[] = [];
  if (portal) list.push({ host: portal, why: "The sign-in page itself (this CRM's /wifi)" });
  if (supabase) list.push({ host: supabase, why: "Sign-in and the authorise call from the page" });
  list.push(
    { host: "captive.apple.com", why: "iPhone/iPad/Mac test for a captive network here" },
    { host: "connectivitycheck.gstatic.com", why: "Android's captive-network test" },
    { host: "clients3.google.com", why: "Older Android and Chrome OS test" },
    { host: "www.msftconnecttest.com", why: "Windows test" },
    { host: "detectportal.firefox.com", why: "Firefox test" },
    { host: "fonts.googleapis.com", why: "The page's typefaces (stylesheet)" },
    { host: "fonts.gstatic.com", why: "The page's typefaces (font files)" },
  );
  return list;
}

/* ------------------------------------------------------------- setup guide */

export interface GuideStep {
  title: string;
  body: string;
}

export const SETUP_GUIDE: Record<Exclude<ControllerVendor, "mock">, GuideStep[]> = {
  unifi: [
    { title: "Create a guest network per villa", body: "Settings → WiFi → Create New. Name it as in the CRM (e.g. Sanctuary-Maaya), tick Guest Network, give it its own VLAN, and turn on client isolation." },
    { title: "Point the guest portal at the CRM", body: "Settings → Hotspot (Guest Hotspot) → Authentication: External Portal Server. Enter the CRM sign-in address (…/wifi). UniFi redirects guests there with their device MAC in the address." },
    { title: "Add the pre-authorisation (walled garden) entries", body: "Same page → Access Control → Pre-Authorization Allowances. Add every host in the walled-garden list below." },
    { title: "Make a dedicated CRM account", body: "Users → Add a LOCAL admin called crm-portal, role Site Admin (or the minimum that can manage guests). Do not reuse your owner login and do not enable two-factor on this account." },
    { title: "Give the CRM its login", body: "Run: supabase secrets set WIFI_CONTROLLER_USER=crm-portal WIFI_CONTROLLER_PASSWORD=…  Then in Controller, choose UniFi, enter the console address (https://…) and the site name, and press Test connection." },
  ],
  omada: [
    { title: "Create an SSID per villa", body: "Wireless Settings → Add. One SSID per villa, tagged with that villa's VLAN, with Guest Network and client isolation on." },
    { title: "Turn on portal authentication", body: "Wireless Settings → Portal → Add: Authentication Type = External Portal Server. Enter the CRM sign-in address (…/wifi). Omada redirects guests with clientMac, apMac, ssidName and radioId." },
    { title: "Add the pre-authentication access entries", body: "Portal → Pre-Authentication Access: add every host in the walled-garden list below." },
    { title: "Make a hotspot operator", body: "Settings → Hotspot Manager → Operator. Create crm-portal with a strong password. It is a limited account meant for portals; do not use an admin." },
    { title: "Give the CRM its login", body: "Run: supabase secrets set WIFI_CONTROLLER_USER=crm-portal WIFI_CONTROLLER_PASSWORD=…  Then in Controller, choose Omada, enter the controller address, site name (and Controller ID on Omada 5.x), and press Test connection." },
  ],
  mikrotik: [
    { title: "Set up the hotspot per villa VLAN", body: "IP → Hotspot → Hotspot Setup on each villa's guest interface (a VLAN or bridge). Keep the hotspot's own login off the road for guests — the CRM will bypass devices it has approved." },
    { title: "Point unauthenticated guests at the CRM", body: "Hotspot → Server Profiles → edit login page to redirect to the CRM sign-in address (…/wifi?mac=$(mac)&ip=$(ip)&link-orig=$(link-orig-esc)). The page needs the device MAC to authorise it." },
    { title: "Add the walled-garden entries", body: "IP → Hotspot → Walled Garden: add every host in the list below (dst-host)." },
    { title: "Turn on the REST API over HTTPS", body: "IP → Services → www-ssl: enable with a valid certificate (a Let's Encrypt certificate on a real domain, or a tunnel). Create a user crm-portal in a group limited to the hotspot menus." },
    { title: "Give the CRM its login", body: "Run: supabase secrets set WIFI_CONTROLLER_USER=crm-portal WIFI_CONTROLLER_PASSWORD=…  Then in Controller, choose MikroTik, enter the router address and press Test connection." },
    { title: "Schedule the expiry sweep", body: "MikroTik bypass bindings carry no expiry, so the CRM removes them when a stay ends. Schedule the sweep (see 'Keeping the network in step')." },
  ],
};

export const SWEEP_SQL = `-- Run once in the Supabase SQL editor (needs the pg_cron and pg_net extensions).
-- Every 15 minutes, tell the controller about accesses the CRM ended.
select cron.schedule(
  'wifi-controller-sweep',
  '*/15 * * * *',
  $$ select net.http_post(
       url     := 'https://<project-ref>.supabase.co/functions/v1/wifi-controller',
       headers := jsonb_build_object('Content-Type','application/json',
                                     'Authorization','Bearer <service-role-key>'),
       body    := '{"action":"sweep"}'::jsonb) $$
);`;

export const SECRET_COMMANDS = `npx supabase secrets set WIFI_CONTROLLER_USER=crm-portal WIFI_CONTROLLER_PASSWORD='choose-a-long-password'
npx supabase functions deploy wifi-controller`;

/* ---------------------------------------------------- portal redirect */

export interface PortalRedirect {
  mac?: string;
  ip?: string;
  portal: {
    apMac?: string;
    ssidName?: string;
    radioId?: string;
    gatewayMac?: string;
    vid?: string;
    site?: string;
  };
  /** Where the guest was heading before the controller turned them back. */
  original?: string;
}

const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const mac = (v: string | null) => (v && MAC.test(v.trim()) ? v.trim().toLowerCase().replace(/-/g, ":") : undefined);
const web = (v: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : undefined);

/**
 * Read what a controller appends when it redirects a guest to the sign-in page.
 * Each vendor names things differently:
 *   UniFi     id (client MAC), ap, ssid, url, t
 *   Omada     clientMac, apMac, ssidName, radioId, gatewayMac, vid, site, redirectUrl
 *   MikroTik  mac, ip, link-orig (set in the hotspot's login page)
 * Nothing here is trusted to choose a booking — the server derives that from
 * who is signed in. A malformed MAC is dropped rather than passed on.
 */
export function parsePortalRedirect(p: URLSearchParams): PortalRedirect {
  return {
    mac: mac(p.get("mac")) ?? mac(p.get("id")) ?? mac(p.get("clientMac")),
    ip: p.get("ip")?.slice(0, 45) || undefined,
    portal: {
      apMac: mac(p.get("apMac")) ?? mac(p.get("ap")),
      ssidName: (p.get("ssidName") ?? p.get("ssid") ?? undefined)?.slice(0, 64),
      radioId: p.get("radioId") ?? undefined,
      gatewayMac: mac(p.get("gatewayMac")),
      vid: p.get("vid") ?? undefined,
      site: p.get("site") ?? undefined,
    },
    original: web(p.get("url")) ?? web(p.get("redirectUrl")) ?? web(p.get("link-orig")),
  };
}
