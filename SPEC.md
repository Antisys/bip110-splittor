# Nostr Orderbook Protocol for bip110-splittor

**Version:** 1.0.0
**Status:** Draft
**Last Updated:** 2026-08-31

---

## 1. Overview

This protocol defines a decentralized orderbook for atomic swaps between the BIP-110 chain and Bitcoin mainchain. Offers are published as signed Nostr events to relays, enabling any splittor node to discover and accept swap offers without a central server.

**Key properties:**
- No custodial escrow (HTLC/MAST atomic swap only)
- No KYC, no accounts, no registration
- Each node generates its own Nostr keypair at first start
- Offers are globally discoverable via Nostr relays
- Supports multiple relays for redundancy

---

## 2. Event Kinds

| Kind | Name | Purpose | Direction |
|------|------|---------|-----------|
| 20110 | Swap Offer | Publish a new swap offer | Maker → Relay |
| 20111 | Offer Accepted | Signal that an offer was accepted | Taker → Relay |
| 5 | Event Deletion | Cancel/delete an offer | Maker → Relay |

---

## 3. Event Schemas

### 3.1 Kind 20110 — Swap Offer

Published by the Maker (offer creator) to advertise a swap.

```json
{
  "kind": 20110,
  "content": {
    "v": 1,
    "side": "sell_b110",
    "b110_amount_sats": 500000,
    "btc_amount_sats": 485000,
    "premium_pct": -3.0,
    "htlc_deadline_blocks": 144,
    "network": "regtest",
    "created_at": 1725000000
  },
  "tags": [
    ["chain", "bip110"],
    ["network", "regtest"],
    ["premium", "-3.0"],
    ["amount", "500000"],
    ["t", "<event_id_of_previous_version>"]
  ]
}
```

**Field Definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | number | yes | Protocol version (currently `1`) |
| `side` | string | yes | `"sell_b110"` = Maker sells BIP-110 coins for BTC; `"buy_b110"` = Maker buys BIP-110 coins with BTC |
| `b110_amount_sats` | number | yes | Amount in satoshis on the BIP-110 chain |
| `btc_amount_sats` | number | yes | Amount in satoshis on the mainchain |
| `premium_pct` | number | yes | Premium/discount in percent. Negative = discount (offer below market), Positive = premium |
| `htlc_deadline_blocks` | number | yes | Number of blocks until HTLC refund locktime |
| `network` | string | yes | `"regtest"` or `"mainnet"` |
| `created_at` | number | yes | Unix timestamp of offer creation |

**Tags:**

| Tag | Purpose |
|-----|---------|
| `["chain", "bip110"]` | Filter by chain type |
| `["network", "regtest"]` | Filter by network |
| `["premium", "-3.0"]` | Filter by premium range |
| `["amount", "500000"]` | Filter by minimum amount |
| `["e", "<event_id>"]` | Reference to previous version (for updates) |

### 3.2 Kind 20111 — Offer Accepted

Published by the Taker (offer acceptor) to signal acceptance. Optional but recommended for coordination.

```json
{
  "kind": 20111,
  "content": {
    "offer_event_id": "abc123...",
    "acceptor_pubkey": "def456...",
    "accepted_at": 1725000100
  },
  "tags": [
    ["e", "abc123..."],
    ["p", "def456..."]
  ]
}
```

**Field Definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `offer_event_id` | string | yes | Event ID of the accepted offer (kind 20110) |
| `acceptor_pubkey` | string | yes | Nostr public key of the acceptor |
| `accepted_at` | number | yes | Unix timestamp of acceptance |

### 3.3 Kind 5 — Event Deletion

Published by the Maker to cancel an offer. Follows NIP-09.

```json
{
  "kind": 5,
  "content": "",
  "tags": [
    ["e", "abc123..."]
  ]
}
```

The relay SHOULD remove the referenced event from its database. Other nodes SHOULD remove the offer from their local DB upon receiving this event.

---

## 4. Signature & Verification

All events MUST be signed using BIP-340 Schnorr signatures (Nostr standard).

**Verification steps:**
1. Verify the signature matches the event's `pubkey` field
2. Verify the event ID is the SHA256 hash of the serialized event
3. Verify `content.v === 1` (protocol version)
4. Verify `content.network` matches the node's configured network
5. Verify `content.b110_amount_sats > 0` and `content.btc_amount_sats > 0`
6. Verify `content.premium_pct` is within reasonable bounds (-50% to +100%)

Events that fail verification MUST be silently discarded.

---

## 5. Relay Configuration

**Default relay:** `wss://damus.io`

Nodes MAY subscribe to multiple relays for redundancy. The recommended configuration:

```json
{
  "relays": [
    "wss://damus.io"
  ]
}
```

**Subscription filter:**

```json
{
  "kinds": [20110, 20111, 5],
  "since": <unix_timestamp_of_last_sync>
}
```

Nodes should re-subscribe every 30 seconds to catch missed events.

---

## 6. Offer Lifecycle

```
Maker creates Offer
    │
    ▼
Kind 20110 published to Relay(s)
    │
    ▼
Taker receives Offer via Subscription
    │
    ▼
Taker accepts Offer
    │
    ├──► Local: HTLC/MAST swap flow starts (existing code)
    │
    └──► Kind 20111 published to Relay(s) (optional)
            │
            ▼
        Maker sees acceptance, prepares HTLC funding
            │
            ▼
        Both parties fund HTLCs on their respective chains
            │
            ▼
        Preimage revealed, coins claimed
            │
            ▼
        Swap complete
```

**Cancellation at any point:**
- Maker publishes Kind 5 → Offer removed from relays
- Taker stops swap → No event needed (HTLC times out)

---

## 7. Mapping to Existing Database

The Nostr event fields map to the existing `DbOffer` schema:

| Nostr Event Field | DbOffer Field | Notes |
|-------------------|---------------|-------|
| `event.id` | `id` | Nostr event ID becomes the offer ID |
| `event.pubkey` | `initiatorPubKey` | Maker's Nostr pubkey |
| `content.b110_amount_sats` | `initiatorB110Amount` | Amount on BIP-110 chain |
| `content.btc_amount_sats` | `acceptorBtcAmount` | Amount on mainchain |
| `content.premium_pct` | *(calculated)* | Stored in tags, computed on read |
| `content.htlc_deadline_blocks` | `lockTime` | HTLC locktime in blocks |
| `content.network` | `networkMode` | `"regtest"` or `"mainnet"` |
| `content.created_at` | `createdAt` | Unix timestamp |
| *(new field)* | `nostr_event_id` | The Nostr event ID (same as `id`) |
| *(new field)* | `source` | `"local"` or `"remote"` |
| *(new field)* | `relay_url` | Which relay the offer was received from |

**New DB columns (migration):**

```sql
ALTER TABLE offers ADD COLUMN nostr_event_id TEXT;
ALTER TABLE offers ADD COLUMN source TEXT DEFAULT 'local';
ALTER TABLE offers ADD COLUMN relay_url TEXT;
```

---

## 8. Security Considerations

1. **Replay Protection:** The existing HTLC/MAST split script provides cross-chain replay protection. The Nostr layer does NOT add replay protection — it relies on the existing cryptographic scheme.

2. **Sybil Attacks:** Anyone can create Nostr keypairs and publish fake offers. Mitigation: Users should verify the counterparty's pubkey reputation over time. The protocol does NOT enforce trust.

3. **Relay Censorship:** Relays may censor events. Using multiple relays mitigates this. Nodes SHOULD log when events are rejected by relays.

4. **Offer Spoofing:** An attacker could republish a valid offer with a different pubkey. Mitigation: The HTLC funding step requires the Maker's signature, so spoofed offers cannot complete a swap.

5. **Metadata Leakage:** Nostr events are public. The amounts, premium, and pubkey are visible to anyone. This is by design for a public orderbook.

---

## 9. Future Extensions

- **Kind 20112:** Orderbook Snapshot (bulk offer sync from a relay)
- **Kind 20113:** Reputation/Trust Score (signed attestations)
- **Encrypted DMs:** For private offer negotiation (NIP-04)
- **Lightning Integration:** Hold-invoice based settlement (like Mostro)
