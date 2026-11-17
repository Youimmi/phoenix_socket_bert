defmodule Phoenix.Socket.V2.BERTSerializer do
  @moduledoc """
  A serializer for `Phoenix.Socket` that encodes server-to-client messages using
  BERT (Binary ERlang Term)

  Client-to-server messages use Phoenix's JSON and binary frame formats.

  Server payloads may contain floats, JavaScript-safe integers, UTF-8 binaries,
  small UTF-8 atoms, proper lists, byte lists, small tuples, and maps with atom,
  UTF-8 binary, or integer keys. Keys that become the same JavaScript property
  name, such as `:a` and `"a"`, overwrite each other. Other Erlang terms are not
  supported.

  `{:binary, data}` pushes, replies, and broadcasts use Phoenix's binary frame
  format with any bytes. The JavaScript decoder returns their data as an
  `ArrayBuffer`, like Phoenix's own serializer.

  Frames larger than 2 MiB raise `ArgumentError`. The JavaScript decoder also
  rejects frames with more than 262,144 terms, 65,536 elements per collection,
  or nesting depth over 64.

  To check payloads on the server before encoding, enable validation at compile
  time, typically in development and test:

      config :phoenix_socket_bert, validate: true

  Validation traverses every payload and raises `ArgumentError` for terms
  outside these rules, so it is disabled by default.

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

  @max_bytes 2_097_152

  @impl true
  defdelegate decode!(raw_message, opts), to: JSONSerializer

  @impl true
  def encode!(%Message{payload: {:binary, data}} = msg) when byte_size(data) <= @max_bytes do
    validate!({msg.join_ref, msg.ref, msg.topic, msg.event})
    msg |> JSONSerializer.encode!() |> binary()
  end

  def encode!(%Reply{payload: {:binary, data}} = reply) when byte_size(data) <= @max_bytes do
    validate!({reply.join_ref, reply.ref, reply.topic, reply.status})
    reply |> JSONSerializer.encode!() |> binary()
  end

  def encode!(%Message{payload: %{}} = msg) do
    serialize({msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload})
  end

  def encode!(%Reply{payload: %{}} = reply) do
    serialize(
      {reply.join_ref, reply.ref, reply.topic, "phx_reply",
       %{response: reply.payload, status: reply.status}}
    )
  end

  def encode!(_), do: invalid!()

  @impl true
  def fastlane!(%Broadcast{payload: {:binary, data}} = msg) when byte_size(data) <= @max_bytes do
    validate!({msg.topic, msg.event})
    msg |> JSONSerializer.fastlane!() |> binary()
  end

  def fastlane!(%Broadcast{payload: %{}} = msg) do
    serialize({nil, nil, msg.topic, msg.event, msg.payload})
  end

  def fastlane!(_), do: invalid!()

  defp binary({:socket_push, :binary, frame} = push) when byte_size(frame) <= @max_bytes, do: push
  defp binary(_), do: invalid!()

  defp serialize({join_ref, ref, topic, event, payload} = message)
       when (is_nil(join_ref) or is_binary(join_ref)) and
              (is_nil(ref) or is_binary(ref)) and is_binary(topic) and is_binary(event) and
              is_map(payload) do
    validate!(message)
    # Sizing first rejects an oversized frame before it is allocated.
    if :erlang.external_size(message, minor_version: 2) > @max_bytes, do: invalid!()
    {:socket_push, :binary, :erlang.term_to_binary(message, minor_version: 2)}
  end

  defp serialize(_), do: invalid!()

  if Application.compile_env(:phoenix_socket_bert, :validate, false) do
    @max_collection 65_536
    @max_depth 64
    @max_terms 262_144

    defp key_name(key) when is_binary(key), do: key
    defp key_name(key) when is_atom(key), do: Atom.to_string(key)
    defp key_name(key) when is_integer(key), do: Integer.to_string(key)
    defp key_name(_), do: invalid!()

    defp validate!(message), do: validate!(message, 0, {@max_terms, @max_bytes})

    defp validate!(_, depth, {terms, _}) when depth > @max_depth or terms <= 0, do: invalid!()

    defp validate!(value, depth, {terms, bytes}) do
      validate_value!(value, depth, {terms - 1, bytes})
    end

    defp validate_value!(value, _, budget) when is_float(value), do: budget

    defp validate_value!(value, _, budget)
         when is_integer(value) and value in -9_007_199_254_740_991..9_007_199_254_740_991,
         do: budget

    defp validate_value!(value, _, {terms, bytes}) when is_binary(value) do
      if byte_size(value) > bytes or not String.valid?(value, :fast_ascii), do: invalid!()
      {terms, bytes - byte_size(value)}
    end

    defp validate_value!(value, depth, budget) when is_atom(value) do
      value = Atom.to_string(value)
      if byte_size(value) > 255, do: invalid!()
      validate_value!(value, depth, budget)
    end

    defp validate_value!(value, depth, budget) when is_tuple(value) and tuple_size(value) < 256 do
      validate_tuple!(value, 0, depth + 1, budget)
    end

    defp validate_value!(%{__struct__: _}, _, _), do: invalid!()

    defp validate_value!(value, depth, budget)
         when is_map(value) and map_size(value) <= @max_collection do
      # Keys that become the same JavaScript property name would overwrite each other.
      value
      |> Enum.reduce({budget, MapSet.new()}, fn {key, item}, {budget, names} ->
        name = key_name(key)
        if MapSet.member?(names, name), do: invalid!()
        {validate!(item, depth + 1, validate!(key, depth + 1, budget)), MapSet.put(names, name)}
      end)
      |> elem(0)
    end

    defp validate_value!([], _, budget), do: budget

    defp validate_value!([_ | _] = value, depth, budget) do
      validate_list!(value, depth + 1, 0, budget)
    end

    defp validate_value!(_, _, _), do: invalid!()

    defp validate_list!([], _, _, budget), do: budget

    defp validate_list!([head | tail], depth, count, budget) when count < @max_collection do
      validate_list!(tail, depth, count + 1, validate!(head, depth, budget))
    end

    defp validate_list!(_, _, _, _), do: invalid!()

    defp validate_tuple!(value, index, _, budget) when index == tuple_size(value), do: budget

    defp validate_tuple!(value, index, depth, budget) do
      validate_tuple!(value, index + 1, depth, validate!(elem(value, index), depth, budget))
    end
  else
    defp validate!(_), do: :ok
  end

  defp invalid! do
    raise ArgumentError,
          "Invalid BERT message: expected bounded UTF-8 strings, safe numbers, atoms, proper lists, small tuples and plain maps, or {:binary, data}, in a frame of at most 2 MiB"
  end
end
