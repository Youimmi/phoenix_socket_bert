defmodule Phoenix.Socket.V2.BERTSerializer do
  @moduledoc """
  A serializer for `Phoenix.Socket` that encodes messages using BERT (Binary ERlang Term)

  Fallback to Phoenix.Socket.V2.JSONSerializer for decoding messages that are not BERT encoded

  ## Usage

  Set the `:serializer` option in your `Phoenix.Socket` configuration:

    **endpoint.ex**

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

  Import the `phoenix_socket_bert` in your app.js and add `decode` option to the `LiveSocket` configuration:

    **app.js**

      import { decode } from 'phoenix_socket_bert'
      import { LiveSocket } from 'phoenix_live_view'
      import { Socket } from 'phoenix'

      let csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content')
      let liveSocket = new LiveSocket('/live', Socket, {
        decode: decode,
        longPollFallbackMs: 2500,
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
    data = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload]
    {:socket_push, :binary, :erlang.term_to_binary(data)}
  end

  def encode!(%Reply{} = reply) do
    data = [
      reply.join_ref,
      reply.ref,
      reply.topic,
      "phx_reply",
      %{response: reply.payload, status: reply.status}
    ]

    {:socket_push, :binary, :erlang.term_to_binary(data)}
  end

  defdelegate encode!(msg), to: JSONSerializer

  @impl true
  def fastlane!(%Broadcast{payload: %{}} = msg) do
    data = :erlang.term_to_binary([nil, nil, msg.topic, msg.event, msg.payload])
    {:socket_push, :binary, data}
  end

  defdelegate fastlane!(raw_message), to: JSONSerializer
end
