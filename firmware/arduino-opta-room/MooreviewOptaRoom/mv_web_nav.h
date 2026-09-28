#pragma once

/** Shared top navigation between /setup and /io-map (Ethernet + WiFi AP). */
#define MV_WEB_NAV_CSS \
  ".nav{background:#e2e8f0;border:1px solid #cbd5e1;border-radius:6px;padding:.5rem .75rem;margin:.35rem 0 .85rem;font-size:.9rem;line-height:1.4}" \
  ".nav a{color:#2563eb;text-decoration:none;font-weight:600;margin-right:.75rem}" \
  ".nav a:hover{text-decoration:underline}" \
  ".nav strong{color:#0f172a;font-weight:700;margin-right:.75rem}"

#define MV_WEB_NAV_SETUP_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><strong>Setup</strong> <a href=\"/io-map\">I/O Map</a></nav>"

#define MV_WEB_NAV_IO_MAP_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><a href=\"/setup\">Setup</a> <strong>I/O Map</strong></nav>"
