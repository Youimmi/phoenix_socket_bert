# PhoenixSocketBert

A serializer for `Phoenix.Socket` that encodes server-to-client messages using BERT (Binary ERlang Term). Client-to-server messages use Phoenix's JSON and binary frame formats.

[![Hex.pm](https://img.shields.io/hexpm/v/phoenix_socket_bert.svg)](https://hex.pm/packages/phoenix_socket_bert) [![Documentation](https://img.shields.io/badge/documentation-gray)](https://hexdocs.pm/phoenix_socket_bert)

## Installation

Add `phoenix_socket_bert` to your list of dependencies in `mix.exs`:

```elixir
def deps do
  [
    {:phoenix_socket_bert, "~> 3.0"}
  ]
end
```

## Usage

Set the `:serializer` option in your `Phoenix.Socket` configuration:

**endpoint.ex**

```elixir
socket "/live", Phoenix.LiveView.Socket,
  websocket: [
    compress: true,
    connect_info: [session: @session_options],
    serializer: [{Phoenix.Socket.V2.BERTSerializer, "~> 2.0.0"}]
  ]

socket "/socket", Phoenix.Socket,
  websocket: [
    compress: true,
    serializer: [{Phoenix.Socket.V2.BERTSerializer, "~> 2.0.0"}]
  ]
```

Import the `phoenix_socket_bert` in your app.js and add `decode` option to the `LiveSocket` configuration:

**app.js**

```javascript
import { decode } from "phoenix_socket_bert";
import { LiveSocket } from "phoenix_live_view";
import { Socket } from "phoenix";

let csrfToken = document
  .querySelector('meta[name="csrf-token"]')
  .getAttribute("content");

let liveSocket = new LiveSocket("/live", Socket, {
  decode: decode,
  params: { _csrf_token: csrfToken },
});

liveSocket.connect();

let socket = new Socket("/socket", {
  decode: decode,
  params: { token: csrfToken },
});

socket.connect();
```

## Wire format

Server messages with map payloads are five-element ETF tuples containing
`join_ref`, `ref`, `topic`, `event`, and `payload`. The JavaScript decoder
accepts `ArrayBuffer` messages and typed array views using this format.

Payloads may contain floats, JavaScript-safe integers, UTF-8 binaries, small
UTF-8 atoms, proper lists, byte lists, tuples with at most 255 elements, and
maps with atom, UTF-8 binary, or integer keys. Keys that become the same
JavaScript property name, such as `:a` and `"a"`, overwrite each other.
Bitstrings, improper lists, and other Erlang terms are not supported.

`{:binary, data}` pushes, replies, and broadcasts use Phoenix's binary frame
format and may carry any bytes; their topic, event, and refs must be UTF-8. The
decoder returns their data as an `ArrayBuffer` (for replies, in
`payload.response`), like Phoenix's own serializer.

Frames are limited to 2 MiB, 262,144 terms, 65,536 elements per collection,
and nesting depth 64. The serializer raises `ArgumentError` for frames larger
than 2 MiB, and the decoder rejects frames outside these rules. Pass an optional
third `onError` argument to `decode` to handle parsing failures; exceptions from
the message callback still propagate.

To check every payload on the server before encoding, enable validation at
compile time, typically in development and test. It traverses each payload and
raises `ArgumentError` for terms outside these rules:

```elixir
config :phoenix_socket_bert, validate: true
```

Enable `compress: true` on the socket: per-message deflate typically reduces
LiveView frames several times.

## Compatibility

Version 3.1 targets Phoenix 1.8 WebSockets using transport protocol 2.0.0 and
the default `ArrayBuffer` binary type. It does not support LongPoll or custom
binary types. The serializer requirement `"~> 2.0.0"` in the socket
configuration selects Phoenix's transport protocol; it is independent of this
package's version.

## Security Concerns

BERT is based on Erlang's external term format, which can represent terms that
should never be accepted from an untrusted client. For that reason this package
uses BERT only for server-to-client messages: Phoenix encodes outbound map
payloads with `:erlang.term_to_binary/2`, and the browser decodes them with the
JavaScript `decode` function.

Client-to-server messages use Phoenix's JSON and binary frame formats, decoded
by Phoenix's V2 JSON serializer. Do not configure clients to send BERT terms
back to the server, and do not add server-side `binary_to_term` decoding for
untrusted websocket input.

## Contributing

To contribute you need to compile `PhoenixSocketBert` from source:

```
$ git clone https://github.com/Youimmi/phoenix_socket_bert.git
$ cd phoenix_socket_bert
```

## Refs

This package is based on the excellent example https://github.com/zookzook/binary_ws by [zookzook (Michael Maier)](https://github.com/zookzook)

Related to the discussion: https://github.com/phoenixframework/phoenix_live_view/issues/616

## Copyright and License

**PhoenixSocketBert** is released under [the MIT License](./LICENSE)
