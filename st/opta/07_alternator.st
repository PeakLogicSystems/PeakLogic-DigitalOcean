(*
  2-pump alternator — round-robin lead with offline bypass.
  Wire MOTORx_ONLINE from motor status (NOT MOTORx_OFFLINE) or a comms OK bit.
*)

AltEnable(ALT1, VPB1);
AltAdvance(ALT1, VPB2);
AltAutoFault(ALT1, VPB3);

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
