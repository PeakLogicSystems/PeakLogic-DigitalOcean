(*
  ALT3 — 3-pump triplex alternator (Off / Lead / Lag / Lag2 / High)

  Tags (see st/fixtures/tags.alternator_triplex.json):
    ALT1           ALT fb, mode ALT3
    SYS_RUN        BOOL enable alternator
    ALT_OFF        BOOL force all pump outputs OFF
    LVL_HIGH       BOOL high level — run ALL online pumps (3)
    LVL_LAG        BOOL first lag float — lead + lag (2 pumps)
    LVL_LAG2       BOOL second lag float — lead + lag + lag2 (3 pumps)
    ALT_BUMP       BOOL momentary rotate lead
    MOTOR1_ONLINE  BOOL pump 1 available
    MOTOR2_ONLINE  BOOL pump 2 available
    MOTOR3_ONLINE  BOOL pump 3 available
    MOTOR1_RUN     BOOL run command pump 1
    MOTOR2_RUN     BOOL run command pump 2
    MOTOR3_RUN     BOOL run command pump 3
    LEAD_RUN       BOOL lead pump running summary
    ALT_FAULT      BOOL no units online

  Operating modes (priority highest first):
    Off    — all 3 motors OFF
    High   — all 3 motors ON (all online)
    Lag2   — lead + lag + lag2 ON when second lag float active (cumulative)
    Lag    — lead + lag ON when first lag float active
    Lead   — exactly one pump (normal round-robin rotation)

  AltLeadSel / AltLagSel / AltLag2Sel are optional manual unit-pick buttons.
*)

AltEnable(ALT1, SYS_RUN);
AltAutoFault(ALT1, SYS_RUN);
AltAdvance(ALT1, ALT_BUMP);

AltOff(ALT1, ALT_OFF);
AltHigh(ALT1, LVL_HIGH);
AltLow(ALT1, LVL_LAG);
AltLag2(ALT1, LVL_LAG2);

AltOnline(ALT1, 1, MOTOR1_ONLINE);
AltOnline(ALT1, 2, MOTOR2_ONLINE);
AltOnline(ALT1, 3, MOTOR3_ONLINE);
AltUnitOut(ALT1, 1, MOTOR1_RUN);
AltUnitOut(ALT1, 2, MOTOR2_RUN);
AltUnitOut(ALT1, 3, MOTOR3_RUN);
AltLead(ALT1, LEAD_RUN);

IF AltFault(ALT1) THEN
  TurnON(ALT_FAULT);
ELSE
  TurnOFF(ALT_FAULT);
END_IF;

TurnOFF(ALT_BUMP);
