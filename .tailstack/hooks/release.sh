#!/usr/bin/env sh
set -eu

umask 077
cd "$TAILSTACK_RELEASE_DIR"

compose() {
  ZEMONEY_IMAGE="$TAILSTACK_IMAGE" \
    docker compose --env-file "$TAILSTACK_ENV_FILE" "$@"
}

read_value() {
  env_key="$1"
  env_source="$2"
  awk -F= -v env_key="$env_key" '
    $1 == env_key {
      sub(/^[^=]*=/, "")
      print
      exit
    }
  ' "$env_source"
}

read_env_value() {
  read_value "$1" "$TAILSTACK_ENV_FILE"
}

read_example_value() {
  read_value "$1" "$TAILSTACK_RELEASE_DIR/.env.docker.example"
}

set_env_value() {
  env_key="$1"
  env_value="$2"
  temporary_env="$TAILSTACK_ENV_FILE.tmp.$$"
  awk -v env_key="$env_key" -v env_value="$env_value" '
    BEGIN {
      prefix = env_key "="
      replaced = 0
    }
    index($0, prefix) == 1 {
      if (!replaced) {
        print prefix env_value
        replaced = 1
      }
      next
    }
    {
      print
    }
    END {
      if (!replaced) {
        print prefix env_value
      }
    }
  ' "$TAILSTACK_ENV_FILE" > "$temporary_env"
  chmod 600 "$temporary_env"
  mv "$temporary_env" "$TAILSTACK_ENV_FILE"
}

configure_serve() {
  # Hosts whose own reverse proxy already owns tailnet port 443 set
  # ZEMONEY_TAILSCALE_SERVE_HTTPS_PORT to another port, or to "off".
  serve_https_port="$(read_env_value ZEMONEY_TAILSCALE_SERVE_HTTPS_PORT)"
  serve_https_port="${serve_https_port:-443}"
  case "$serve_https_port" in
    off) ;;
    ""|*[!0-9]*)
      printf 'Invalid ZEMONEY_TAILSCALE_SERVE_HTTPS_PORT: %s\n' \
        "$serve_https_port" >&2
      return 1
      ;;
  esac

  published_address="$(compose port app 3000)"
  case "$published_address" in
    127.0.0.1:*) ;;
    *)
      printf 'App port is not bound to loopback: %s\n' "$published_address" >&2
      return 1
      ;;
  esac

  published_port="${published_address##*:}"
  case "$published_port" in
    ""|*[!0-9]*)
      printf 'Could not determine the published app port: %s\n' \
        "$published_address" >&2
      return 1
      ;;
  esac

  if [ "$serve_https_port" = "off" ]; then
    return 0
  fi
  tailscale serve --bg --yes --https="$serve_https_port" \
    "http://$published_address"
}

start_and_validate() {
  if ! compose up -d --no-build --wait --wait-timeout 120 app; then
    compose logs --no-color --tail 100 app >&2 || true
    compose stop app || true
    return 1
  fi

  if ! configure_serve; then
    compose stop app || true
    return 1
  fi
}

case "$TAILSTACK_ACTION" in
  deploy)
    shared_dir="$(CDPATH= cd "$(dirname "$TAILSTACK_ENV_FILE")" && pwd)"
    runtime_dir="$shared_dir/runtime"
    android_release_dir="$runtime_dir/releases/android"
    secrets_dir="$shared_dir/secrets"
    mkdir -p \
      "$runtime_dir/data" \
      "$runtime_dir/storage" \
      "$android_release_dir" \
      "$secrets_dir"
    chmod 700 \
      "$runtime_dir" \
      "$runtime_dir/data" \
      "$runtime_dir/storage" \
      "$secrets_dir"
    chmod 750 "$android_release_dir"
    chown -R 1000:1000 \
      "$runtime_dir/data" \
      "$runtime_dir/storage" \
      "$android_release_dir" \
      "$secrets_dir"

    # The shared .env is the source of truth for the public URL; it is set
    # once on the host and never taken from the repository.
    public_base_url="$(read_env_value PUBLIC_BASE_URL)"
    case "$public_base_url" in
      https://?*) ;;
      *)
        printf 'Set PUBLIC_BASE_URL to the public HTTPS URL in %s\n' \
          "$TAILSTACK_ENV_FILE" >&2
        exit 1
        ;;
    esac
    if [ "$public_base_url" = "$(read_example_value PUBLIC_BASE_URL)" ]; then
      printf 'PUBLIC_BASE_URL in %s is still the example value\n' \
        "$TAILSTACK_ENV_FILE" >&2
      exit 1
    fi

    public_host="${public_base_url#https://}"
    public_host="${public_host%%/*}"
    public_host="${public_host%%:*}"
    configured_host="$(read_env_value ZEMONEY_HOST)"
    if [ -z "$configured_host" ] ||
      [ "$configured_host" = "$(read_example_value ZEMONEY_HOST)" ]; then
      set_env_value ZEMONEY_HOST "$public_host"
      printf 'Configured Traefik host: %s\n' "$public_host"
    fi

    configured_secrets_dir="$(read_env_value ZEMONEY_SECRETS_DIR)"
    case "$configured_secrets_dir" in
      ""|"./secrets")
        set_env_value ZEMONEY_SECRETS_DIR "$secrets_dir"
        printf 'Configured persistent secrets directory: %s\n' "$secrets_dir"
        ;;
    esac

    compose build app
    compose stop app

    backup_file="$TAILSTACK_BACKUP_DIR/pre-$TAILSTACK_RELEASE_ID.tar.gz"
    tar -C "$runtime_dir" -czf "$backup_file" data storage
    chmod 600 "$backup_file"
    printf 'Created pre-migration backup: %s\n' "$backup_file"

    start_and_validate
    ;;
  rollback)
    start_and_validate
    ;;
  status)
    compose ps
    tailscale serve status
    ;;
  *)
    printf 'Unsupported Tailstack action: %s\n' "$TAILSTACK_ACTION" >&2
    exit 2
    ;;
esac
