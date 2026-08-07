defmodule Phoenix.Socket.V2.BERTSerializer do
  @moduledoc """
  A serializer for `Phoenix.Socket` that encodes server-to-client messages using
  BERT (Binary ERlang Term)

  Client-to-server messages use Phoenix's JSON and binary frame formats.

  Server payloads may contain floats, JavaScript-safe integers, UTF-8 binaries,
  small UTF-8 atoms, proper lists, byte lists, small tuples, and maps. Binary
  replies and other Erlang terms are not supported.

  ## Usage

  Set the `:serializer` option in your `Phoenix.Socket` configuration:

    **endpoint.ex**

      socket "/live", Phoenix.LiveView.Socket,
        websocket: [
          connect_info: [session: @session_options],
          serializer: [{Phoenix.Socket.V2.BERTSerializer, "~> 2.0.0"}]
        ]

      socket "/socket", Phoenix.Socket,
        websocket: [
          serializer: [{Phoenix.Socket.V2.BERTSerializer, "~> 2.0.0"}]
        ]

  Import the `phoenix_socket_bert` in your app.js and add `decode` option to the `LiveSocket` configuration:

    **app.js**

      import { decode } from 'phoenix_socket_bert'
      import { LiveSocket } from 'phoenix_live_view'
      import { Socket } from 'phoenix'

      let csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content')
      let liveSocket = new LiveSocket('/live', Socket, {
        decode: decode,
        params: { _csrf_token: csrfToken }
      })

      liveSocket.connect()

      let socket = new Socket("/socket", { decode: decode, params: { token: csrfToken } })
      socket.connect()
  """

  @behaviour Phoenix.Socket.Serializer

  alias Phoenix.Socket.{Broadcast, Message, Reply, V2.JSONSerializer}

  @impl true
  defdelegate decode!(raw_message, opts), to: JSONSerializer

  @impl true
  def encode!(%Message{payload: %{}} = msg) do
    {:socket_push, :binary,
     :erlang.term_to_binary(
       {msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload},
       minor_version: 2
     )}
  end

  def encode!(%Reply{payload: %{}} = reply) do
    {:socket_push, :binary,
     :erlang.term_to_binary(
       {reply.join_ref, reply.ref, reply.topic, "phx_reply",
        %{response: reply.payload, status: reply.status}},
       minor_version: 2
     )}
  end

  @impl true
  def fastlane!(%Broadcast{payload: %{}} = msg) do
    {:socket_push, :binary,
     :erlang.term_to_binary({nil, nil, msg.topic, msg.event, msg.payload}, minor_version: 2)}
  end
end
