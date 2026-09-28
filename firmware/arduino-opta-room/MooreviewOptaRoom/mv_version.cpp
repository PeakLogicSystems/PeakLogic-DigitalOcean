#include "mv_version.h"
#include <string.h>

void mvVersionAppendStatus(JsonObject obj) {
  obj["protocolVersion"] = MV_PROTOCOL_VERSION;
  obj["firmwareVersion"] = MV_FIRMWARE_VERSION;
}

bool mvCheckClientProtocol(int clientProtocol, const char* clientVersion, char* errOut, size_t errLen) {
  (void)clientVersion;
  if (clientProtocol <= 0) return true;
  if (clientProtocol == MV_PROTOCOL_VERSION) return true;
  if (errOut && errLen > 0) {
    snprintf(errOut, errLen,
             "protocol version mismatch (Opta=%d PeakLogic=%d)",
             MV_PROTOCOL_VERSION, clientProtocol);
  }
  return false;
}
