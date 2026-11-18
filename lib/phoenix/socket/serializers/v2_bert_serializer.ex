defmodule Phoenix.Socket.V2.BERTSerializer do
  @moduledoc """
  A serializer for `Phoenix.Socket` that encodes server-to-client messages using
  BERT (Binary ERlang Term). Client-to-server messages use Phoenix's JSON and
  binary frame formats.

  See the [README](README.md) for setup, the wire format, limits, and
  validation.
  """

  @behaviour Phoenix.Socket.Serializer

  alias Phoenix.Socket.{Broadcast, Message, Reply, V2.JSONSerializer}

  @max_bytes 2_097_152

  @impl true
  defdelegate decode!(raw_message, opts), to: JSONSerializer

  @impl true
  def encode!(%Message{payload: {:binary, data}} = msg) when byte_size(data) <= @max_bytes do
    validate!({msg.join_ref, msg.topic, msg.event})
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

  defp invalid! do
    raise ArgumentError,
          "Invalid BERT message: expected string or nil refs, a string topic and event, and a payload " <>
            "that follows the wire format in the phoenix_socket_bert README, in a frame of at most 2 MiB"
  end

  defp serialize({join_ref, ref, topic, event, _} = message)
       when (is_nil(join_ref) or is_binary(join_ref)) and (is_nil(ref) or is_binary(ref)) and
              is_binary(topic) and is_binary(event) do
    validate!(message)
    binary({:socket_push, :binary, :erlang.term_to_binary(message, minor_version: 2)})
  end

  defp serialize(_), do: invalid!()

  if Application.compile_env(:phoenix_socket_bert, :validate, false) do
    @max_collection 65_536
    @max_depth 64
    @max_terms 262_144

    defguardp is_safe_integer(value)
              when is_integer(value) and value in -9_007_199_254_740_991..9_007_199_254_740_991

    defp name!(value, {terms, bytes}) when is_atom(value) do
      name = Atom.to_string(value)
      if byte_size(name) > min(255, bytes), do: invalid!()
      {name, {terms, bytes - byte_size(name)}}
    end

    defp name!(value, {terms, bytes}) when is_binary(value) do
      if byte_size(value) > bytes or not String.valid?(value, :fast_ascii), do: invalid!()
      {value, {terms, bytes - byte_size(value)}}
    end

    defp name!(value, budget) when is_safe_integer(value), do: {Integer.to_string(value), budget}
    defp name!(_, _), do: invalid!()

    defp validate!(message), do: validate!(message, 0, {@max_terms, @max_bytes})

    defp validate!(_, depth, {terms, _}) when depth > @max_depth or terms <= 0, do: invalid!()

    defp validate!(value, depth, {terms, bytes}),
      do: validate_value!(value, depth, {terms - 1, bytes})

    defp validate_list!([], _, _, budget), do: budget

    defp validate_list!([head | tail], depth, count, budget) when count < @max_collection do
      validate_list!(tail, depth, count + 1, validate!(head, depth, budget))
    end

    defp validate_list!(_, _, _, _), do: invalid!()

    defp validate_tuple!(value, index, _, budget) when index == tuple_size(value), do: budget

    defp validate_tuple!(value, index, depth, budget) do
      validate_tuple!(value, index + 1, depth, validate!(elem(value, index), depth, budget))
    end

    defp validate_value!(value, _, budget) when is_float(value) or is_safe_integer(value),
      do: budget

    defp validate_value!(value, _, budget) when is_atom(value) or is_binary(value) do
      value |> name!(budget) |> elem(1)
    end

    defp validate_value!(value, depth, budget) when is_tuple(value) and tuple_size(value) < 256 do
      validate_tuple!(value, 0, depth + 1, budget)
    end

    defp validate_value!(value, _, _) when is_struct(value), do: invalid!()

    defp validate_value!(value, depth, budget)
         when is_map(value) and map_size(value) <= @max_collection do
      value
      |> Enum.reduce({budget, MapSet.new()}, fn {key, item}, {{terms, _} = budget, names} ->
        if terms <= 0, do: invalid!()
        {name, {terms, bytes}} = name!(key, budget)
        if MapSet.member?(names, name), do: invalid!()
        {validate!(item, depth + 1, {terms - 1, bytes}), MapSet.put(names, name)}
      end)
      |> elem(0)
    end

    defp validate_value!([], _, budget), do: budget

    defp validate_value!([_ | _] = value, depth, budget) do
      validate_list!(value, depth + 1, 0, budget)
    end

    defp validate_value!(_, _, _), do: invalid!()
  else
    @compile {:inline, validate!: 1}

    defp validate!(_), do: :ok
  end
end
