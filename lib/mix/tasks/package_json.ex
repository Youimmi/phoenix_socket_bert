defmodule Mix.Tasks.PackageJson do
  @moduledoc false
  use Mix.Task

  @path "package.json"
  @regex ~r/"version":\s*"[^"]+"/

  @impl true
  def run(_) do
    version = Mix.Project.config()[:version]
    package_json = Regex.replace(@regex, File.read!(@path), "\"version\": \"#{version}\"")

    File.write!(@path, package_json)
    Mix.shell().info("Set package.json version #{version}")
  end
end
