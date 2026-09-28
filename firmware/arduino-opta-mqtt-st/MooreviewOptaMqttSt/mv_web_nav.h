#pragma once

/** Purple Standard brand — matches public/css/pc.css (--ps-purple*). */
#define MV_WEB_NAV_CSS \
  ":root{--ps-purple:#49104F;--ps-purple-dark:#3a0d3f;--ps-purple-deep:#2c0930;--ps-purple-light:#efd9f2}" \
  "h1{color:var(--ps-purple)}" \
  "button.primary{background:var(--ps-purple);color:#fff;border-color:var(--ps-purple)}" \
  "button.primary:hover{background:var(--ps-purple-dark)}" \
  ".nav{background:var(--ps-purple);border:2px solid var(--ps-purple-deep);border-radius:8px;padding:.7rem 1rem;margin:.35rem 0 1rem;font-size:1.12rem;line-height:1.5;font-weight:800;letter-spacing:.01em}" \
  ".nav a{color:var(--ps-purple-light);text-decoration:none;font-weight:800;margin-right:1.1rem}" \
  ".nav a:hover{text-decoration:underline;color:#fff}" \
  ".nav strong{color:#fff;font-weight:900;margin-right:1.1rem}"

#define MV_WEB_NAV_LINKS \
  "<a href=\"/io-map\">I/O Map</a> <a href=\"/ct-cal\">Calibrate CT</a> <a href=\"/mcsa\">MCSA</a> <a href=\"/hvac\">HVAC</a> <a href=\"/ahu-env\">AHU env</a>"

#define MV_WEB_NAV_SETUP_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><strong>Setup</strong> " MV_WEB_NAV_LINKS "</nav>"

#define MV_WEB_NAV_IO_MAP_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><a href=\"/setup\">Setup</a> <strong>I/O Map</strong> <a href=\"/ct-cal\">Calibrate CT</a> <a href=\"/mcsa\">MCSA</a> <a href=\"/hvac\">HVAC</a> <a href=\"/ahu-env\">AHU env</a></nav>"

#define MV_WEB_NAV_CT_CAL_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><a href=\"/setup\">Setup</a> <a href=\"/io-map\">I/O Map</a> <strong>Calibrate CT</strong> <a href=\"/mcsa\">MCSA</a> <a href=\"/hvac\">HVAC</a> <a href=\"/ahu-env\">AHU env</a></nav>"

#define MV_WEB_NAV_AHU_ENV_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><a href=\"/setup\">Setup</a> <a href=\"/io-map\">I/O Map</a> <a href=\"/ct-cal\">Calibrate CT</a> <a href=\"/mcsa\">MCSA</a> <a href=\"/hvac\">HVAC</a> <strong>AHU env</strong></nav>"

#define MV_WEB_NAV_MCSA_ACTIVE \
  "<nav class=\"nav\" aria-label=\"PeakLogic\"><a href=\"/setup\">Setup</a> <a href=\"/io-map\">I/O Map</a> <a href=\"/ct-cal\">Calibrate CT</a> <strong>MCSA</strong> <a href=\"/hvac\">HVAC</a> <a href=\"/ahu-env\">AHU env</a></nav>"
