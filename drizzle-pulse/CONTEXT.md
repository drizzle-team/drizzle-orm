# Drizzle Pulse

Streams row changes from PostgreSQL to consumers that subscribe to server-defined queries.

## Language

**Drizzle Pulse**:
The product and its npm package, `drizzle-pulse`.
_Avoid_: realtime SDK, Pulse library

**Realtime**:
The feature area that Drizzle Pulse covers, and the title of its section in the Drizzle docs.
_Avoid_: real-time, live queries

**Source table**:
An application table whose row changes Drizzle Pulse streams.
_Avoid_: pulsed table, watched table

**Pulse table**:
A source table wrapped by `pulse(table)`, from which queries are defined.
_Avoid_: collection, pulse collection

**Live collection**:
The current set of rows that match one query with its arguments, kept in memory and updated from the change stream.
_Avoid_: in-memory collection, collection (alone)

**CDC event stream**:
The row change events for one query with its arguments, delivered one by one without keeping any rows.
_Avoid_: event subscription, events transport
