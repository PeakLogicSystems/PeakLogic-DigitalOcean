(*
  TENET UL212-E / UL212NT-E — Protocol 17 (ATO Modbus-17 manual)

  Configure protocol 17 in the UL212 Fuel app. Baud 9600, net address 1.

  Tags:
    FUEL_LEVEL_MM   REAL  HR 0x0100  height mm (register ×10)
    FUEL_TILT       INT   HR 0x0102  tilt raw
    TANK_FULL_MM    REAL  memory     calibrated full height (default 1000 mm)
    FUEL_PCT        REAL  memory     level / full × 100
    FUEL_SIGNAL_OK  BOOL  memory     height in 30–2500 mm
    FUEL_LOW        BOOL  memory     below 80 mm

  Manual frames (slave 1, FC03 qty 1):
    height  01 03 01 00 00 01 85 F6
    tilt    01 03 01 02 00 01 24 36
*)

SetInt(FUEL_PCT, FUEL_LEVEL_MM / TANK_FULL_MM * 100.0);

IF WithInLimits(FUEL_LEVEL_MM, 30.0, 2500.0) THEN
  TurnON(FUEL_SIGNAL_OK);
ELSE
  TurnOFF(FUEL_SIGNAL_OK);
END_IF;

IF WithInLimits(FUEL_LEVEL_MM, 80.0, 2500.0) THEN
  TurnOFF(FUEL_LOW);
ELSE
  TurnON(FUEL_LOW);
END_IF;
