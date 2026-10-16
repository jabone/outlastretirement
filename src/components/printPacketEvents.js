// The event that opens the Print / PDF Report chooser. Its own module so the
// buttons that send it (sidebar, Dashboard, Readiness) do not pull the
// packet and its print sheets into the app's startup code; the packet loads
// on the first request (PrintPacketLoader.jsx).
export const PRINT_PACKET_EVENT = 'cfe:print-packet';
