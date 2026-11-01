# Security Specification — HOST256 ERP Firestore Rules (Multi-Role RBAC Edition)

## 1. Data Invariants

1. **Tenant & RBAC Identity Invariant (`ownerId`, `staffMembers`, `workspaceBindings`)**: Every workspace document contains an immutable `ownerId`. Writes are strictly permitted only when `request.auth.uid == ownerId` OR when the authenticated verified user has a live, non-revoked `/workspaceBindings/{ownerId}_{uid}` linked to an `active` `/staffMembers/{inviteId}` record whose `role` (`Admin`, `Cashier`, `Warehouse`, `Accountant`) matches the specific operation's required role tier.
2. **Instant Membership Revocation Invariant**: `isActiveStaffWithRole(ownerId, allowedRoles)` synchronously checks both `/workspaceBindings/$(ownerId)_$(request.auth.uid)` and `/staffMembers/$(inviteId).status == 'active'`. Revoking or deleting a staff invite immediately revokes access across all collections.
3. **Verified Identity Invariant**: All reads and writes require `request.auth != null && request.auth.token.email_verified == true`. Email-based role bindings and bootstrapped admin status (`amarvinmulindwa2004@gmail.com`) are strictly rejected if `email_verified != true`.
4. **Zero-Lookup Secure List Queries**: `allow list` blocks never call `get()` or `exists()`. List queries enforce tenant and role isolation directly via `existing().ownerId == request.auth.uid` or `'authorizedEmails' in existing() && request.auth.token.email in existing().authorizedEmails` (populated per collection's permitted role tier).
5. **PII & Payroll Isolation Invariant**: `/employees/{employeeId}` (HR salaries & PII) is strictly isolated to `Owner` and `Admin` roles only; Cashiers, Warehouse, and Accountants are denied read/write access.
6. **Subcollection Master Gate Invariant**: Any read or write to `/sales/{saleId}/items/{itemId}` verifies parent `/sales/$(saleId)` ownership/role access via `get()` / `getAfter()`.
7. **Temporal & Immortal Field Integrity**: `createdAt == request.time` on `create` (immutable on `update`); `updatedAt == request.time` on `create` and `update`; `ownerId` is immutable across all updates.
8. **Terminal State Locking Invariant**: Refunded `/sales/{saleId}` (`status == 'refunded'`), cancelled `/purchaseOrders/{poId}` (`status == 'cancelled'`), and closed `/shiftRegisters/{shiftId}` (`status == 'closed'`) block subsequent non-owner/non-admin mutations.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Shadow / Ghost Field Injection (`products`)**: Valid `Product` + `"isSuperAdmin": true` -> `PERMISSION_DENIED` (`hasOnly`).
2. **Payload 2 — Unverified Admin/Staff Email Spoof (`staffMembers` / `products`)**: `email_verified: false` -> `PERMISSION_DENIED` (`isVerifiedUser()`).
3. **Payload 3 — Uninvited Cross-Tenant Write (`sales`)**: `attacker_uid` sets `ownerId: "victim_uid"` without active `workspaceBindings` -> `PERMISSION_DENIED`.
4. **Payload 4 — Path ID Poisoning (`products/{junk_200_chars}`)**: Document ID > 128 chars -> `PERMISSION_DENIED` (`isValidId`).
5. **Payload 5 — PII Blanket Scraping (`employees` / `customers` list)**: Unfiltered collection list or Cashier attempting to list `employees` payroll -> `PERMISSION_DENIED`.
6. **Payload 6 — Forged Client Timestamp (`ledgerEntries`)**: Client supplies past `createdAt` -> `PERMISSION_DENIED` (`request.time`).
7. **Payload 7 — Immortal Field Mutation (`products` update)**: Mutating `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
8. **Payload 8 — Terminal State Reversal (`shiftRegisters` / `sales` update)**: Cashier reopening a `closed` Z-Report shift or reversing a `refunded` sale -> `PERMISSION_DENIED`.
9. **Payload 9 — Value Poisoning on Whitelisted Key (`purchaseOrders` payable settlement)**: Updating `paymentStatus` with an invalid enum or negative `balanceDue` -> `PERMISSION_DENIED` (`isValidPurchaseOrder(incoming())`).
10. **Payload 10 — Orphaned Subcollection Write (`sales/{saleId}/items/{itemId}`)**: Writing `SaleItem` without valid parent `/sales/{saleId}` -> `PERMISSION_DENIED`.
11. **Payload 11 — Self-Privilege Escalation on `workspaceBindings`**: Cashier tries to bind themselves with `role: 'Admin'` when their `/staffMembers/{inviteId}` has `role: 'Cashier'` -> `PERMISSION_DENIED`.
12. **Payload 12 — Orphaned Foreign Reference (`purchaseOrders`)**: Creating a credit `PurchaseOrder` referencing a non-existent `productId` -> `PERMISSION_DENIED`.
