(* =============================================================================
   Opta Room — Shelly Flood Gen4 (WiFi peripherals) -> valve + alarm
   Firmware: arduino-opta-room (NOT arduino-opta-mqtt-st)
   Required tags: SHELLY1_FLOOD, SHELLY1_ONLINE, SHELLY2_FLOOD, SHELLY2_ONLINE (BOOL in),
                  R1, R2 (BOOL out)

   Each Shelly joins the Opta WiFi AP and pushes to
   http://192.168.4.1:8080/api/peripheral/shelly?dev=<n>&...
   Slotted tags SHELLY<n>_* flow to PeakLogic over PARC.

   R1 = shutoff valve (energise on ANY leak).
   R2 = alarm (any leak OR any sensor offline).
   ============================================================================= *)
IF IsON(SHELLY1_FLOOD) OR IsON(SHELLY2_FLOOD) THEN
  TurnON(R1);
ELSE
  TurnOFF(R1);
END_IF;

IF IsON(SHELLY1_FLOOD) OR IsON(SHELLY2_FLOOD)
   OR IsOFF(SHELLY1_ONLINE) OR IsOFF(SHELLY2_ONLINE) THEN
  TurnON(R2);
ELSE
  TurnOFF(R2);
END_IF;
