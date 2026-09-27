(*
  2-pump alternator — lead/lag rotation with Off / High / Lag / Lead modes

  Tags (see st/fixtures/tags.alternator_pumps.json):
    ALT1           ALT fb — 2-pump rotation
    SYS_RUN        BOOL enable alternator
    ALT_OFF        BOOL shut all automatic run outputs off
    ALT_BUMP       BOOL momentary manual rotate
    LVL_HIGH       BOOL high level — force ALL online pumps ON
    LVL_LOW        BOOL lag request — lead + lag (2 pumps when both online)
    TANK_LVL       REAL wet-well level (optional analog bands)
    MOTOR1_ONLINE  BOOL pump 1 available (NOT offline)
    MOTOR2_ONLINE  BOOL pump 2 available
    MOTOR1_RUN     BOOL run command to pump 1
    MOTOR2_RUN     BOOL run command to pump 2
    LEAD_RUN       BOOL lead-only summary output
    ALT_FAULT      BOOL no units online alarm

  Priority (highest first):
    1. Off — all unit outputs off, rotation paused
    2. Manual lead/lag/lag2 selection buttons (AltLeadSel / AltLagSel / AltLag2Sel)
    3. High / Lag from digital inputs or analog level bands
    4. Normal round-robin rotation (lead only — one pump)

  Operating modes:
    Off    — both motors OFF
    High   — all online pumps ON (both on ALT2)
    Lag    — lead + lag ON when lag input active
    Lead   — exactly one pump (normal rotation)
*)

AltEnable(ALT1, SYS_RUN);
AltAutoFault(ALT1, SYS_RUN);
AltAdvance(ALT1, ALT_BUMP);
AltOff(ALT1, ALT_OFF);
AltHigh(ALT1, LVL_HIGH);
AltLow(ALT1, LVL_LOW);
AltLevel(ALT1, TANK_LVL);
AltLevelBands(ALT1, 0, 15, 85, 100);

AltOnline(ALT1, 1, MOTOR1_ONLINE);
AltOnline(ALT1, 2, MOTOR2_ONLINE);
AltUnitOut(ALT1, 1, MOTOR1_RUN);
AltUnitOut(ALT1, 2, MOTOR2_RUN);
AltLead(ALT1, LEAD_RUN);

(* Optional manual unit select: unit index 1–4, BOOL tag per button *)
(* AltLeadSel(ALT1, 1, BTN_LEAD1); *)
(* AltLagSel(ALT1, 2, BTN_LAG2); *)

IF AltFault(ALT1) THEN
  TurnON(ALT_FAULT);
ELSE
  TurnOFF(ALT_FAULT);
END_IF;

TurnOFF(ALT_BUMP);
