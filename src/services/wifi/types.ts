/**
 * Guest Wi-Fi — the contract between the CRM and whatever runs the network.
 *
 * The CRM decides WHO may be online and UNTIL WHEN (the database functions in
 * `20260925091000_guest_wifi.sql`). A controller is what makes the network
 * obey. Today that is `MockWifiController`, which only records the decision;
 * a real one (UniFi, Omada, Mikrotik…) implements this same interface later
 * and nothing that calls it changes.
 */

export type ControllerKind = "mock" | "edge";

export type WifiDeviceType = "phone" | "tablet" | "laptop" | "tv" | "other";
export type WifiDeviceStatus = "active" | "disconnected" | "blocked" | "expired";
export type WifiAuthStatus = "pending" | "authorized" | "revoked" | "expired";
export type WifiSessionStatus = "active" | "ended" | "expired" | "revoked";

export interface WifiDevice {
  id: string;
  bookingId: string;
  villaId: string;
  guestId?: string;
  /** The login that registered it: the holder, or a companion. */
  userId?: string;
  deviceName: string;
  deviceType: WifiDeviceType;
  /** Staff only — never present on what a guest reads. */
  macAddress?: string;
  ipAddress?: string;
  status: WifiDeviceStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  accessStatus?: WifiAuthStatus;
  expiresAt?: string;
  /** Which controller carried this out. "mock" means nothing happened on a network. */
  controller: string;
}

export interface WifiSession {
  id: string;
  deviceId: string;
  bookingId: string;
  villaId: string;
  connectedAt: string;
  disconnectedAt?: string;
  lastSeenAt: string;
  expiresAt: string;
  status: WifiSessionStatus;
  controller: string;
  controllerSessionId?: string;
}

/** What the guest portal is told about the caller's own access. */
export interface MyWifiAccess {
  state: "ready" | "authorized" | "expired" | "not_yet" | "unavailable";
  reason?: string;
  bookingId?: string;
  bookingReference?: string;
  villaId?: string;
  villaName?: string;
  ssid?: string;
  captivePortal?: boolean;
  controller?: string;
  opensAt?: string;
  expiresAt?: string;
}

/** What the controller's redirect to the portal tells us about the device. */
export interface PortalParams {
  apMac?: string;
  ssidName?: string;
  radioId?: string;
  gatewayMac?: string;
  vid?: string;
  site?: string;
}

/** Which hardware family runs the network. */
export type ControllerVendor = "mock" | "unifi" | "omada" | "mikrotik";

/** The property's captive Wi-Fi configuration. The controller's LOGIN is not
 *  here: it is an edge function secret and never reaches the browser. */
export interface WifiSettings {
  kind: ControllerVendor;
  controllerUrl: string;
  site: string;
  controllerId: string;
  portalUrl: string;
  graceMinutes: number;
  earlyHours: number;
  maxDevices: number;
  downKbps: number | null;
  upKbps: number | null;
  dataCapMb: number | null;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestMessage: string;
}

export interface ControllerTestResult {
  ok: boolean;
  message: string;
  /** Whether the edge function has its secrets — never their values. */
  secrets?: { user: boolean; password: boolean };
}

export interface AuthorizeDeviceInput {
  deviceName: string;
  deviceType?: WifiDeviceType;
  /** Supplied by the controller's redirect in production; absent in a browser. */
  macAddress?: string;
  ipAddress?: string;
  /** Extra detail from the redirect that some controllers need (Omada). */
  portal?: PortalParams;
}
export interface ExtendDeviceInput {
  deviceId: string;
  /** ISO time. */
  until: string;
}
export interface RevokeDeviceInput {
  deviceId: string;
  reason?: string;
}
export interface DisconnectDeviceInput {
  deviceId: string;
}
export interface GetDevicesInput {
  villaId?: string;
}
export interface GetSessionInput {
  deviceId: string;
}

export interface WifiControllerResult {
  ok: boolean;
  error?: string;
  deviceId?: string;
  expiresAt?: string;
  controller: ControllerKind;
}

export interface WifiController {
  readonly kind: ControllerKind;
  authorizeDevice(input: AuthorizeDeviceInput): Promise<WifiControllerResult>;
  extendDevice(input: ExtendDeviceInput): Promise<WifiControllerResult>;
  revokeDevice(input: RevokeDeviceInput): Promise<WifiControllerResult>;
  disconnectDevice(input: DisconnectDeviceInput): Promise<WifiControllerResult>;
  getConnectedDevices(input: GetDevicesInput): Promise<WifiDevice[]>;
  getSession(input: GetSessionInput): Promise<WifiSession | null>;
}
