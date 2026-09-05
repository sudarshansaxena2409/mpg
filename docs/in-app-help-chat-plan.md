# In-app Help Chat: delivery plan

## Objective

Give customers a fast, in-app route to get help with an order or account issue,
without requiring an email ticket. The first release should make it easy to
start a conversation, give support the order context they need, and reliably
close the loop.

## Recommended first release

Build a **human-support chat** experience, with optional help topics before the
customer starts a conversation. Do not make an AI chatbot a launch dependency:
it can be added later once the support workflow and knowledge base are stable.

Customer experience:

1. A persistent **Help** entry is available from the account area and the order
   details screen.
2. Starting from an order pre-attaches order ID, restaurant, delivery status,
   timestamps, and payment status. The customer can change the selected order.
3. The customer chooses a topic (late order, missing/incorrect items, refund,
   delivery partner issue, account/payment, other), writes a message, and may
   attach photos.
4. They see a conversation thread, agent replies, message status, and an
   understandable expected-response message. They receive a push notification
   for an agent reply.
5. A customer can reopen a conversation; support can resolve it and record the
   outcome.

Support experience:

1. A support inbox shows new, open, waiting-on-customer, and resolved chats.
2. An agent can claim/assign a chat, reply, use approved templates, add private
   notes, set topic/outcome, and resolve or reopen it.
3. The agent sees the attached order context and a link to the existing order,
   refund, and delivery tools. Financial actions remain in those existing tools
   for the MVP.

## Functional requirements

| Area | MVP requirement | Acceptance signal |
| --- | --- | --- |
| Identity | Authenticate every customer and agent; enforce conversation ownership and support roles. | A user cannot retrieve another customer's chat. |
| Conversations | Create, list, view, reply, resolve, and reopen chats; persist an audit trail. | A new message remains available after app restart. |
| Order context | Attach one order and a topic at creation; snapshot key order data. | Agent can identify the affected order without asking first. |
| Realtime | Deliver new messages in-app promptly; reconnect safely after offline periods. | New message appears without manual refresh. |
| Notifications | Push notification on agent replies, respecting device permission and preferences. | Tapping a notification opens the correct chat. |
| Attachments | Support image uploads with type/size limits and malware scanning or a managed provider. | Unsupported or unsafe files are rejected safely. |
| Agent workflow | Inbox, assignment, statuses, private notes, templates, and resolution outcome. | A chat has an accountable owner and lifecycle state. |
| Safety & privacy | Rate limits, abuse reporting, PII-safe logs, retention policy, and agent audit history. | Abuse and access incidents are traceable. |
| Reporting | Track first response time, resolution time, reopen rate, contact rate per order, and CSAT. | Weekly dashboard can show whether email overhead is falling. |

## Non-functional requirements

- Availability: target 99.9% for chat APIs; queued delivery and retry when the
  realtime channel is unavailable.
- Performance: conversation list under 2 seconds and new-message delivery under
  5 seconds under normal network conditions.
- Scale: size the initial implementation for peak active orders and retain a
  provider or architecture path to scale agents independently.
- Security: encrypted transport, encrypted storage where supported, least-
  privilege support roles, and no payment-card data in chat.
- Compliance: confirm applicable privacy, deletion, and retention obligations
  with legal/security before launch. Make retention configurable.
- Accessibility: keyboard and screen-reader usable agent console; readable
  states and error messages in the customer app.

## Architecture recommendation

Use the existing authenticated user and order services as the system of record.
Create a chat service (or managed support platform integration) with
`conversation`, `message`, `attachment`, `assignment`, and `audit_event`
records. It should expose REST/GraphQL endpoints for history and commands plus
a WebSocket or managed realtime channel for updates. Send notifications through
the existing mobile push provider; include idempotency keys for sends and a
durable event/outbox mechanism so a reply is not lost if a notification fails.

Before build, choose one delivery route:

- **Managed support/chat platform:** fastest route (typically 3–4 weeks), with
  built-in agent console, routing, and reports. Confirm data residency, pricing,
  export, SSO, and order-context integration.
- **Custom service and agent console:** more control and a tailored workflow,
  but normally 5–7 weeks for a production-ready first release.

For the stated goal of reducing customer effort quickly, the managed-platform
route is the recommended default unless data-control requirements rule it out.

## Indicative timeline

Assumptions: mobile/web client already has authentication and order-detail
screens; backend exposes order data; one product/design owner and two engineers
are available; existing push infrastructure is usable. Timings exclude lengthy
procurement or compliance approval.

| Week | Managed-platform route | Custom route |
| --- | --- | --- |
| 1 | Discovery, journey mapping, provider selection, data/privacy review, metrics baseline | Discovery, data model/API design, UX, threat model, metrics baseline |
| 2 | Customer entry points, order-context integration, inbox configuration | Chat APIs/storage, authz, customer conversation screens |
| 3 | Notifications, routing/templates, analytics, internal pilot | Realtime delivery, agent inbox/assignment, attachments |
| 4 | QA, accessibility/security checks, staff training, limited rollout | Notifications, reporting, QA and internal pilot |
| 5 | Production rollout and daily monitoring | Security/accessibility review, staff training, limited rollout |
| 6–7 | Improvement backlog | Production rollout, monitoring, and improvement backlog |

Plan a **10–20% staged rollout** first, with email retained as a fallback during
the pilot. Expand only after response-time staffing targets are met.

## Team and operational needs

- Product owner: support taxonomy, policies, success metrics, rollout decisions.
- Product designer: customer flow, agent workflow, empty/error states, and
  accessibility review.
- Backend engineer: identity, order-context access, events, integrations, and
  observability.
- Client engineer: Help entry points, conversation UI, notifications, offline
  behavior, and analytics instrumentation.
- Support lead: staffing model, hours, macros, escalation rules, QA rubric, and
  training.
- Security/privacy reviewer: vendor or architecture review, retention, access,
  and incident process.

The operational commitment is essential: chat will reduce email only if agents
can meet an explicit service target. Start with a published target such as first
reply within 10 minutes during support hours, then tune it from pilot data.

## Launch metrics and guardrails

Measure a baseline for 2–4 weeks before launch, then monitor weekly:

- customer contact rate per 100 orders and share handled outside email;
- median and 90th-percentile first-response and resolution times;
- one-touch resolution rate, reopen rate, CSAT, and customer abandonment;
- agent backlog/occupancy and escalations;
- defect rate: failed sends, notification opens, attachment failures, and
  unauthorized-access attempts.

Pause expansion if backlog grows beyond staffing capacity, P90 response time
misses the stated target for multiple days, or a security/privacy issue appears.

## Decisions needed to start

1. Which clients launch first: iOS, Android, web, or all three?
2. What support hours, languages, and first-response SLA will be promised?
3. Should the first release use a managed provider or a custom service?
4. Which existing order/refund/delivery systems may agents access, and what
   actions can they take from chat?
5. Are photo attachments required at launch, and what retention/data-residency
   constraints apply?
6. What are the escalation rules for food safety, payment fraud, harassment,
   and emergency delivery issues?

## Definition of done for MVP

The release is ready when an authenticated customer can start a chat from an
order, an authorized agent can handle it with the necessary order context,
messages and push notifications are reliable, access and audit controls pass
review, the support team has been trained, and the dashboard reports the launch
metrics above.
