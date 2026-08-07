# PhoenixSocketBert

A serializer for `Phoenix.Socket` that encodes server-to-client messages using BERT (Binary ERlang Term). Client-to-server messages use Phoenix's JSON and binary frame formats.

[![Hex.pm](https://img.shields.io/hexpm/v/phoenix_socket_bert.svg)](https://hex.pm/packages/phoenix_socket_bert) [![Documentation](https://img.shields.io/badge/documentation-gray)](https://hexdocs.pm/phoenix_socket_bert)

## Installation

Add `phoenix_socket_bert` to your list of dependencies in `mix.exs`:

```elixir
def deps do
  [
    {:phoenix_socket_bert, "~> 2.0"}
  ]
end
```

## Usage

Set the `:serializer` option in your `Phoenix.Socket` configuration:

**endpoint.ex**

```elixir
socket "/live", Phoenix.LiveView.Socket,
  websocket: [
    connect_info: [session: @session_options],
    serializer: [{Phoenix.Socket.V2.BERTSerializer, "~> 2.0.0"}]
  ]

socket "/socket", Phoenix.Socket,
  websocket: [
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

Server messages are five-element ETF tuples containing `join_ref`, `ref`,
`topic`, `event`, and `payload`. The JavaScript decoder accepts only
`ArrayBuffer` messages using this format.

Payloads may contain floats, JavaScript-safe integers, UTF-8 binaries, small
UTF-8 atoms, proper lists, byte lists, tuples with at most 255 elements, and
maps. Use either atom keys or UTF-8 binary keys consistently within a map.
Binary replies, bitstrings, improper lists, and other Erlang terms are not
supported.

## Compatibility

Version 2.0 targets Phoenix 1.8 WebSockets using transport protocol 2.0.0 and
the default `ArrayBuffer` binary type. It does not support LongPoll, custom
binary types, or Phoenix `{:binary, data}` server payloads. The serializer
requirement `"~> 2.0.0"` in the socket configuration selects Phoenix's transport
protocol; it is independent of this package's version.

## Security Concerns

BERT is based on Erlang's external term format, which can represent terms that
should never be accepted from an untrusted client. For that reason this package
uses BERT only for server-to-client messages: Phoenix encodes outbound map
payloads with `:erlang.term_to_binary/2`, and the browser decodes them with the
JavaScript `decode` function.

Client-to-server messages use Phoenix's JSON and binary frame formats, decoded
by `Phoenix.Socket.V2.JSONSerializer`. Do not configure clients to send BERT
terms back to the server, and do not add server-side `binary_to_term` decoding
for untrusted websocket input.

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
