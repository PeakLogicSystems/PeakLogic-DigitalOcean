# Alarm notification contacts and scoped assignment

PeakLogic separates **login accounts** from **alarm notification contacts**. Contacts can receive email/SMS when tags enter alarm states. Each contact may be assigned to **all** alarms or **selected** sites, field devices, and PdM/fleet assets.

## Where to configure

| Deployment | UI path | Store |
|------------|---------|-------|
| **Cloud SaaS** (3100) | **People** → Edit user → Alarm contact + **Alarm assignment** | `cloud_tenants.json` user `profile.alarmNotifications` |
| **Appliance** (3090) | **Alarms → Notification users…** | `data/users.json` |

Login accounts (appliance **System setup → Features**, cloud org roles) do **not** control alarm delivery unless the same person is also configured as an alarm contact.

## Assign a contact (cloud)

1. Open **People** (`/people`) as `tenant_admin` or platform admin.
2. **Edit** a user (or invite first, then edit after they accept).
3. Turn on **Alarm contact on**, set email/SMS, min level, contact schedule.
4. Under **Alarm assignment**:
   - Check **All sites, devices & assets** for tenant-wide alarms (default).
   - Uncheck it to pick from multi-select lists:
     - **Sites** — cloud sites (`/sites`)
     - **Devices** — assigned field Optas (`/sites/devices`)
     - **Assets** — fleet map assets (`/fleet`)
5. **Save profile**.

Hold **Ctrl** (Windows) or **Cmd** (Mac) to select multiple items in each list.

## Assign a contact (appliance)

1. Open **Alarms → Notification users…**
2. Select a user or **Add user**.
3. Configure alarm channels, min level, quiet hours.
4. Under **Alarm assignment**:
   - Check **All sites, devices & assets**, or
   - Uncheck it and pick from:
     - **Sites** — CMMS site ID and/or Cloud gateway site ID (`System setup`)
     - **Devices** — drivers on this box (Parc Opta, etc.)
     - **Assets** — PdM assets (`Historian → Logger → PdM`)
5. **Save user**.

## Scope rules

| Mode | Behavior |
|------|----------|
| `all` (default) | Notify on every alarm that passes level/schedule/channel filters |
| `scoped` | Notify only when the alarm matches **any** selected site, device, or asset |
| `scoped` + empty lists | No notifications (forces explicit assignment) |

Additional filters (unchanged):

- **Min alarm level** — inner / outer / alarm only
- **Contact days / hours / quiet hours** (cloud People; appliance quiet hours)
- **Email / SMS** channel toggles

## How alarms are matched

On alarm transition, PeakLogic resolves context from the tag:

```
tag → driver → deviceId → cloud site assignment (or CMMS/cloud site ID on appliance)
tag → PdM assetTags / fleet asset meta → assetId(s)
```

Recipients are filtered with `matchesNotificationScope()` after level and schedule checks.

## Profile schema

Under `profile.alarmNotifications`:

```json
{
  "enabled": true,
  "email": true,
  "sms": false,
  "minLevel": "inner",
  "notificationScope": {
    "mode": "scoped",
    "siteIds": ["7767_Land_O_Lakes_Blvd"],
    "deviceIds": ["opta_field_01"],
    "assetIds": ["pump-1"]
  }
}
```

## API

| Route | Purpose |
|-------|---------|
| `GET /tenant/notification-scope-catalog` | Cloud: sites, devices, assets for People pickers |
| `GET /users/notification-scope-catalog` | Appliance: local sites/devices/assets for pickers |
| `PUT /tenant/users/:id` | Cloud: save user profile including scope |
| `PUT /users/:id` | Appliance: save notification user including scope |

Platform admin may pass `?tenantId=` on the cloud catalog route when editing users in another org.

## CMMS MQTT

When **CMMS / MQTT integration** is enabled, `{topicPrefix}/{siteId}/alarm-notify` includes the **filtered** recipient list (same scope rules as email/SMS). See [CMMS_INTEGRATION.md](CMMS_INTEGRATION.md).

## Related docs

- [CLOUD_USER_GUIDE.md](CLOUD_USER_GUIDE.md)
- [PEAKLOGIC-SITE-ADMIN-LOGIN-QUICK-START.md](PEAKLOGIC-SITE-ADMIN-LOGIN-QUICK-START.md)
- [CMMS_INTEGRATION.md](CMMS_INTEGRATION.md)
- [EST_PC_PARITY.md](EST_PC_PARITY.md)
