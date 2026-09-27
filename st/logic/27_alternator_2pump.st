(*
  ALT2 — 2-pump alternator (Off / Lead / Lag / High)

  Tags (see st/fixtures/tags.alternator_2pump.json):
    ALT1           ALT fb, mode ALT2
    SYS_RUN        BOOL enable alternator
    ALT_OFF        BOOL force all pump outputs OFF
    LVL_HIGH       BOOL high level — run ALL online pumps
    LVL_LAG        BOOL lag request — run lead + lag (2 pumps when both online)
    ALT_BUMP       BOOL momentary rotate lead
    MOTOR1_ONLINE  BOOL pump 1 available
    MOTOR2_ONLINE  BOOL pump 2 available
    MOTOR1_RUN     BOOL run command pump 1
    MOTOR2_RUN     BOOL run command pump 2
    LEAD_RUN       BOOL lead pump running summary
    ALT_FAULT      BOOL no units online

  Operating modes (priority highest first):
    Off   — both motors OFF
    High  — both motors ON (all online)
    Lag   — lead + lag ON (2 pumps when lag input active)
    Lead  — exactly one pump (normal round-robin rotation)

  AltLeadSel / AltLagSel are optional manual unit-pick buttons, not operating modes.
*)

AltEnable(ALT1, SYS_RUN);
AltAutoFault(ALT1, SYS_RUN);
AltAdvance(ALT1, ALT_BUMP);

AltOff(ALT1, ALT_OFF);
AltHigh(ALT1, LVL_HIGH);
AltLow(ALT1, LVL_LAG);

AltOnline(ALT1, 1, MOTOR1_ONLINE);
AltOnline(ALT1, 2, MOTOR2_ONLINE);
AltUnitOut(ALT1, 1, MOTOR1_RUN);
AltUnitOut(ALT1, 2, MOTOR2_RUN);
AltLead(ALT1, LEAD_RUN);

IF AltFault(ALT1) THEN
  TurnON(ALT_FAULT);
ELSE
  TurnOFF(ALT_FAULT);
END_IF;

TurnOFF(ALT_BUMP);
