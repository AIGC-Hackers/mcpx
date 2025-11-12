# Fish completion for mcpx

# Global flags
complete -c mcpx -l config -d 'Path to mcpx.json (override ./mcp.json + ~/.mcpx/mcp.json)' -r
complete -c mcpx -l root -d 'Working directory for stdio servers' -r
complete -c mcpx -l log-level -d 'Logging level' -xa 'debug info warn error'
complete -c mcpx -l oauth-timeout -d 'OAuth browser timeout in ms' -x
complete -c mcpx -l help -d 'Show help'
complete -c mcpx -s h -d 'Show help'
complete -c mcpx -l version -d 'Show version'
complete -c mcpx -s v -d 'Show version'
complete -c mcpx -s V -d 'Show version'

# Commands
complete -c mcpx -f -n '__fish_use_subcommand' -a list -d 'List configured servers and tools'
complete -c mcpx -f -n '__fish_use_subcommand' -a call -d 'Call a tool by selector or URL'

# list command flags
complete -c mcpx -f -n '__fish_seen_subcommand_from list' -l output -d 'Output format' -xa 'auto text json toon raw'
complete -c mcpx -f -n '__fish_seen_subcommand_from list' -l timeout -d 'List operation timeout in ms' -x

# call command flags
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l output -d 'Output format' -xa 'auto text json toon raw'
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l timeout -d 'Call timeout in ms' -x
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l http-url -d 'Ad-hoc HTTP server URL' -x
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l stdio -d 'Ad-hoc stdio server command' -x
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l env -d 'Environment variables' -x
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l cwd -d 'Working directory' -r
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l name -d 'Server name for ad-hoc server' -x
complete -c mcpx -f -n '__fish_seen_subcommand_from call' -l persist -d 'Persist ad-hoc server to config'
