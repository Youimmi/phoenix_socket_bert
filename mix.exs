defmodule PhoenixSocketBert.MixProject do
  use Mix.Project

  @description "A serializer for `Phoenix.Socket` that encodes and decodes messages using BERT (Binary ERlang Term)"
  @source_url "https://github.com/Youimmi/phoenix_socket_bert"
  @version "1.0.8"

  def project do
    [
      aliases: aliases(),
      app: :phoenix_socket_bert,
      deps: deps(),
      description: @description,
      docs: docs(),
      elixir: "~> 1.15",
      package: package(),
      source_url: @source_url,
      version: @version
    ]
  end

  defp aliases do
    [
      lint: [
        "hex.audit",
        "hex.outdated",
        "deps.unlock --check-unused",
        "compile --warnings-as-errors",
        "format --check-formatted --dry-run"
      ],
      setup: ["deps.get", "package_json"],
      upgrade: ["cmd rm -rf _build deps mix.lock", "setup"]
    ]
  end

  defp deps do
    [
      {:ex_doc, ">= 0.0.0", only: :dev, runtime: false},
      {:phoenix, ">= 1.7.0", optional: true}
    ]
  end

  defp docs do
    [
      extras: ["CHANGELOG.md", "LICENSE", "README.md"],
      main: "readme",
      skip_undefined_reference_warnings_on: ["CHANGELOG.md"],
      source_ref: "v#{@version}",
      source_url: @source_url
    ]
  end

  defp package do
    [
      files: ~w(CHANGELOG.md LICENSE README.md lib mix.exs package.json priv),
      licenses: ["MIT"],
      links: %{
        Changelog: "https://hexdocs.pm/phoenix_socket_bert/changelog.html",
        GitHub: @source_url,
        Youimmi: "https://youimmi.com"
      },
      maintainers: ["Yuri S."]
    ]
  end
end
