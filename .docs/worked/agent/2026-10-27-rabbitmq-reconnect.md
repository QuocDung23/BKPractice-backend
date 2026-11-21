# 2026-10-27 — RabbitMqService reconnects and opens a single connection

- Author: Claude (on `feature/submission-service`)
- Scope: shared infrastructure in `libs/common/src/messaging/rabbitmq.service.ts`. It is used by
  Judge, Learning and Submission. Business code is unchanged.

## Spec and plan

- Spec: none. The user approved this as an infrastructure task without a feature spec, after the
  2026-10-27 review of Submission connectivity.
- Plan: the plan shown in conversation (resilience item 2). No plan file was requested.
- Tasks: N/A.
- Spec status at start: N/A — infrastructure task approved by the user.

## Questions clarified

| Question                                                                                            | Conclusion                                                                                        | Source                                             |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Is a feature spec required?                                                                         | No. The user approved it as an infrastructure task.                                               | User decision                                      |
| Are health/readiness checks, per-service topology ownership or per-service RabbitMQ users in scope? | No. They are recorded as follow-ups.                                                              | Plan shown in conversation                         |
| Where does the worked entry go?                                                                     | `.docs/worked/agent/`, because `libs/` belongs to no single service.                              | Plan shown in conversation; user approved the plan |
| May the change alter topology, retry count or message format?                                       | No. Exchanges, queues, DLQ bindings, the 3-retry policy and the message properties are unchanged. | Scope of the task                                  |

## What was done

Before this change, `RabbitMqService` opened a connection on first use and kept the channel forever:

- If RabbitMQ restarted, every consumer in Judge, Learning and Submission silently stopped, and every
  publish failed until the process was restarted.
- Two callers arriving at the same time at start-up could each open their own connection.

Now:

- **One connection at a time.** `getChannel()` shares a single in-flight `opening` promise, so
  concurrent callers wait for the same connection.
- **Consumers are remembered.** `consume()` records `{ queue, handler }`. A `Set` tracks which
  consumers are attached to the current channel, so no consumer is ever attached twice.
- **Automatic reconnect.** On connection or channel `close`, the service drops its references and
  schedules a reconnect. The delay starts at 1 s and doubles up to 30 s. A successful reconnect
  re-asserts the topology, re-attaches every consumer and resets the delay.
- **Broker down at start-up.** `consume()` logs a warning and schedules a reconnect instead of
  crashing the service.
- **ACK on the delivering channel.** `handleMessage` ACKs, NACKs and republishes retries on the
  channel that delivered the message. If that channel is gone, the error is caught and the broker
  redelivers the unacknowledged message. All consumers are idempotent.
- **Shutdown.** A `shuttingDown` flag stops reconnects and pending timers during application
  shutdown.

## Why these choices

- **A shared opening promise** is the smallest fix for the start-up race. The submission service
  starts its consumer and its outbox relay in the same `onModuleInit` phase.
- **Re-attach from a stored list** because amqplib consumers belong to a channel and disappear with
  it. No caller had to change.
- **ACK on the original channel** because a delivery tag is only valid on its own channel. Acking on
  a new channel would close that channel with a protocol error.
- **Exponential backoff with a 30 s cap** to avoid hammering a broker that is restarting, while still
  recovering within seconds of it coming back.
- **Publish still throws while the broker is down.** The callers already handle this:
  - the outbox relay keeps the event pending;
  - Run and Submit move the record to `INTERNAL_ERROR`;
  - Judge's handler fails, so the message is retried or dead-lettered.

## How the feature works

1. A service starts. Each consumer calls `consume()`, and publishers call `publish()`. The first
   call opens the connection, creates a confirm channel, sets `prefetch(1)` and asserts the
   topology. Concurrent calls share that work.
2. Messages arrive on the channel. The handler runs, and the message is ACKed, retried (up to 3
   times) or dead-lettered, all on that same channel.
3. RabbitMQ restarts, so the connection emits `close`. The service clears its connection, channel
   and attached set, logs `RabbitMQ connection lost; reconnecting`, and waits 1 s.
4. The reconnect opens a new connection and channel, re-asserts the topology, re-attaches every
   stored consumer, and logs `RabbitMQ reconnected; N consumer(s) attached`. If it fails, it waits
   2 s, then 4 s, and so on up to 30 s.
5. A publish attempted while disconnected tries to open the connection itself. If that fails, the
   error goes back to the caller as before.
6. When the application shuts down, timers are cleared and the channel and connection are closed
   without triggering a reconnect.

## Configuration

No configuration change. The delays are code constants: `RABBIT_RECONNECT_INITIAL_DELAY_MS = 1000`
and `RABBIT_RECONNECT_MAX_DELAY_MS = 30000`.

## Verification

- Commands run and their results:
  - New `libs/common/src/messaging/rabbitmq.service.spec.ts`: 7 tests passed. They cover:
    - a single connection for concurrent callers;
    - reconnect plus re-attaching all consumers;
    - backoff on a failed reconnect;
    - a broker that is down at start-up;
    - no reconnect after shutdown;
    - ACK on the delivering channel;
    - dead-lettering after the maximum retries.
  - `pnpm typecheck`: passed.
  - `pnpm lint`: passed.
  - `pnpm test`: 25 suites, 134 tests passed.
  - `pnpm build`: all 6 applications compiled.
- Not verified:
  - A live restart (`docker compose restart rabbitmq`) with Judge, Learning and Submission running.
  - Behaviour under a broker that accepts the connection but rejects topology assertions.

## Remaining

- Not done:
  - Health/readiness checks that report broker, database and Redis state. `/health` is still
    liveness only.
  - Each service declaring only the exchanges and queues it owns.
  - Per-service RabbitMQ users.
- Risks:
  - Publishers and consumers still share one channel, so a channel error caused by one affects both
    until the reconnect.
  - Messages being handled when the channel drops are redelivered, so handlers must stay
    idempotent. They are today.
