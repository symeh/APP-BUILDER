---
name: Offline sync model
description: Durable behavior for the collector and recycler local-first workflow.
---

The field workflow treats the local device as the source of truth while connectivity is uncertain: create, edit, offer, and handover actions are persisted before synchronization, and sync history stays visible to both roles.

**Why:** Collectors must be able to continue safely in low-connectivity conditions without losing a draft or silently overwriting a change made by the other role.

**How to apply:** New mutations should add a queue action and preserve the local record. When another role changes the same record before synchronization, surface an explicit conflict and let the user keep either the local or shared copy.