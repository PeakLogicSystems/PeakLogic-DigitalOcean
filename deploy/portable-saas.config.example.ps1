# Copy to: deploy/portable-saas.config.ps1
# Works on any PC where this OneDrive repo folder is synced.
#
# Usage (PowerShell):
#   cd <OneDrive>\peaklogic-mvp-suite
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-hvac-from-onedrive.ps1
#
# Or double-click: deploy\Deploy-HVAC-SaaS.cmd

@{
  # Leave blank to auto-detect from script location (recommended).
  # Set only if you run the script from outside the repo folder.
  RepoRoot = ''

  # SSH target (peaklogic.io SaaS droplet)
  HostAlias    = 'mv-saas'
  HostName     = '159.223.154.210'
  SshUser      = 'root'
  RemoteRoot   = '/home/peaklogic'
  ConnectTimeoutSec = 45

  # SSH key — synced via OneDrive at .ssh\id_ed25519_peaklogic
  # Leave blank to use: <RepoRoot>\.ssh\id_ed25519_peaklogic
  IdentityFile = ''

  # ACE org tenant on production (bundled project seed target)
  AceTenantId = '219c5c35-8415-4409-a13c-9059d698c998'

  # Regenerate local .est.zip before upload
  EnsureBundledProjects = $true

  # After upload: copy clean zips into tenant library + restart service
  ReseedTenants = $true
  RestartService = $true
  ServiceName = 'peaklogic-saas'
}
