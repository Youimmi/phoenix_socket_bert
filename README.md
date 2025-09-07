# PhoenixSocketBert

A serializer for `Phoenix.Socket` that encodes messages using BERT (Binary ERlang Term)

[![Hex.pm](https://img.shields.io/hexpm/v/phoenix_socket_bert.svg)](https://hex.pm/packages/phoenix_socket_bert) [![Documentation](https://img.shields.io/badge/documentation-gray)](https://hexdocs.pm/phoenix_socket_bert)

## Installation

Add `phoenix_socket_bert` to your list of dependencies in `mix.exs`:

```elixir
def deps do
  [
    {:phoenix_socket_bert, "~> 1.1"}
  ]
end
```

## Usage

Set the `:serializer` option in your `Phoenix.Socket` configuration:

**endpoint.ex**

```elixir
socket "/live", Phoenix.LiveView.Socket,
  longpoll: [connect_info: [session: @session_options]],
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
  longPollFallbackMs: 2500,
  params: { _csrf_token: csrfToken },
});

liveSocket.connect();

let socket = new Socket("/socket", {
  decode: decode,
  params: { token: csrfToken },
});

socket.connect();
```

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
