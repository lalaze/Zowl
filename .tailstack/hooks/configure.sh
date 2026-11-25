#!/usr/bin/env sh
set -eu

shared_dir="$(CDPATH= cd "$(dirname "$TAILSTACK_ENV_FILE")" && pwd)"
runtime_dir="$shared_dir/runtime"
secrets_dir="$shared_dir/secrets"

mkdir -p \
  "$runtime_dir/data" \
  "$runtime_dir/storage" \
  "$runtime_dir/releases/android" \
  "$secrets_dir"
chmod 700 \
  "$runtime_dir" \
  "$runtime_dir/data" \
  "$runtime_dir/storage" \
  "$secrets_dir"
chmod 750 \
  "$runtime_dir/releases" \
  "$runtime_dir/releases/android"
chown -R 1000:1000 \
  "$runtime_dir/data" \
  "$runtime_dir/storage" \
  "$runtime_dir/releases/android" \
  "$secrets_dir"

temporary_env="$TAILSTACK_ENV_FILE.tmp.$$"
trap 'rm -f "$temporary_env"' EXIT HUP INT TERM

awk \
  -v data_dir="$runtime_dir/data" \
  -v storage_dir="$runtime_dir/storage" \
  -v android_release_dir="$runtime_dir/releases/android" \
  -v secrets_dir="$secrets_dir" '
    /^ZEMONEY_DATA_DIR=/ {
      print "ZEMONEY_DATA_DIR=" data_dir
      next
    }
    /^ZEMONEY_STORAGE_DIR=/ {
      print "ZEMONEY_STORAGE_DIR=" storage_dir
      next
    }
    /^ANDROID_RELEASE_DIR=/ {
      print "ANDROID_RELEASE_DIR=" android_release_dir
      next
    }
    /^ZEMONEY_SECRETS_DIR=/ {
      print "ZEMONEY_SECRETS_DIR=" secrets_dir
      next
    }
    {
      print
    }
  ' "$TAILSTACK_ENV_TEMPLATE" > "$temporary_env"

mv "$temporary_env" "$TAILSTACK_ENV_FILE"
trap - EXIT HUP INT TERM

printf 'Created %s\n' "$TAILSTACK_ENV_FILE"
printf 'Set PUBLIC_BASE_URL (and ZEMONEY_HOST if it differs) there before the first deploy.\n'
printf 'Persistent secrets directory: %s\n' "$secrets_dir"
