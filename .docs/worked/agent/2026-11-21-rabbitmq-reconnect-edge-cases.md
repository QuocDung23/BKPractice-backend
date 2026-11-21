# 2026-11-21 — Recover RabbitMQ deliveries and close late connections

- Author: Codex
- Scope: shared RabbitMQ infrastructure on `fix/rabbitmq-reconnect`.

## Spec and plan

The user asked to correct the two issues found during review of the reconnect branch. The
existing [reconnect work note](2026-10-27-rabbitmq-reconnect.md) records the infrastructure
scope. The [Judge spec](../../specs/04-judge/standard-judge/spec.md) requires an ACK only
after publishing the result successfully.

## Questions clarified

| Question | Conclusion | Source |
| --- | --- | --- |
| What happens when a retry cannot be confirmed? | Reset the active connection and let RabbitMQ redeliver the unacknowledged original. | Branch review and existing reconnect behavior |
| What happens when connection setup finishes during shutdown? | Close that late connection before exposing it to a caller. | Branch review and existing shutdown behavior |

## What changed

If retry publishing or acknowledgement fails on the active channel, the service marks that
connection lost and closes it. This releases deliveries waiting for acknowledgement even
when the broker kept the channel open. The existing reconnect loop opens a new channel and
reattaches the remembered consumers. A delivery callback from an older channel can only
trigger recovery for its own channel.

Connection setup checks for shutdown after connecting and again after declaring topology.
When shutdown wins, the setup handler closes the connection before it returns a channel.
The Jest regression tests cover failed retry confirmation and shutdown during connection
establishment.

## Configuration

No configuration change.

## Verification

- Ran `git diff --check`.
- Ran an isolated simulation against the service source with fake AMQP connections. Failed retry
  confirmation, redelivery after reconnect, and shutdown during connection and channel setup passed.
- The offline dependency install was blocked by a missing package in the local cache. Jest and the
  full repository checks remain unverified. A live broker restart remains unverified because the
  current environment cannot access Docker.
