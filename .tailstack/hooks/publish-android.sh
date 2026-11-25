#!/bin/sh
set -eu

umask 077
remote_directory="${1:-}"
archive_name="${2:-}"

case "$remote_directory" in
  ""|/*|*".."*|*[!A-Za-z0-9_./-]*)
    printf 'Unsafe Tailstack remote directory: %s\n' "$remote_directory" >&2
    exit 2
    ;;
esac
case "$archive_name" in
  ""|*/*|*[!A-Za-z0-9_.-]*)
    printf 'Unsafe Android release archive: %s\n' "$archive_name" >&2
    exit 2
    ;;
  *.tar.gz) ;;
  *)
    printf 'Unsafe Android release archive: %s\n' "$archive_name" >&2
    exit 2
    ;;
esac

project_root="$HOME/$remote_directory"
incoming_directory="$project_root/incoming"
archive_path="$incoming_directory/$archive_name"
shared_directory="$project_root/shared"
release_dir="$shared_directory/runtime/releases/android"

if [ ! -f "$archive_path" ]; then
  printf 'Android release archive does not exist: %s\n' "$archive_path" >&2
  exit 1
fi

staging_directory="$(mktemp -d "$incoming_directory/android-release.XXXXXX")"
temporary_apk=""
temporary_manifest=""
cleanup() {
  rm -rf "$staging_directory"
  [ -z "$temporary_apk" ] || rm -f "$temporary_apk"
  [ -z "$temporary_manifest" ] || rm -f "$temporary_manifest"
}
trap cleanup EXIT HUP INT TERM

tar -xzf "$archive_path" -C "$staging_directory"
if find "$staging_directory" -type l | grep . >/dev/null 2>&1; then
  printf 'Android release archive contains a symbolic link\n' >&2
  exit 1
fi
file_count="$(find "$staging_directory" -type f | wc -l | tr -d ' ')"
if [ "$file_count" -ne 2 ]; then
  printf 'Android release archive must contain exactly two files\n' >&2
  exit 1
fi

manifest_path="$staging_directory/release.json"
if [ ! -f "$manifest_path" ]; then
  printf 'Android release manifest is missing\n' >&2
  exit 1
fi
file_name="$(
  sed -n 's/^[[:space:]]*"fileName":[[:space:]]*"\([^"]*\)",[[:space:]]*$/\1/p' \
    "$manifest_path"
)"
expected_size="$(
  sed -n 's/^[[:space:]]*"sizeBytes":[[:space:]]*\([0-9][0-9]*\),[[:space:]]*$/\1/p' \
    "$manifest_path"
)"
expected_sha256="$(
  sed -n 's/^[[:space:]]*"sha256":[[:space:]]*"\([0-9a-f]*\)",[[:space:]]*$/\1/p' \
    "$manifest_path"
)"
case "$file_name" in
  ""|*/*|*[!A-Za-z0-9_.+-]*)
    printf 'Android release manifest contains an unsafe APK name\n' >&2
    exit 1
    ;;
  *.apk) ;;
  *)
    printf 'Android release manifest contains an unsafe APK name\n' >&2
    exit 1
    ;;
esac
case "$expected_size" in
  ""|*[!0-9]*)
    printf 'Android release manifest contains an invalid size\n' >&2
    exit 1
    ;;
esac
case "$expected_sha256" in
  *[!0-9a-f]*)
    printf 'Android release manifest contains an invalid SHA-256\n' >&2
    exit 1
    ;;
esac
if [ "${#expected_sha256}" -ne 64 ]; then
  printf 'Android release manifest contains an invalid SHA-256\n' >&2
  exit 1
fi

apk_path="$staging_directory/$file_name"
if [ ! -f "$apk_path" ]; then
  printf 'Android release APK is missing: %s\n' "$file_name" >&2
  exit 1
fi
actual_size="$(wc -c < "$apk_path" | tr -d ' ')"
actual_sha256="$(sha256sum "$apk_path" | awk '{print $1}')"
if [ "$actual_size" != "$expected_size" ]; then
  printf 'Android release APK size does not match its manifest\n' >&2
  exit 1
fi
if [ "$actual_sha256" != "$expected_sha256" ]; then
  printf 'Android release APK SHA-256 does not match its manifest\n' >&2
  exit 1
fi

mkdir -p "$release_dir"
chmod 750 "$release_dir"
chown 1000:1000 "$release_dir"
temporary_apk="$release_dir/.$file_name.tmp.$$"
temporary_manifest="$release_dir/.release.json.tmp.$$"
install -m 0644 "$apk_path" "$temporary_apk"
chown 1000:1000 "$temporary_apk"
mv "$temporary_apk" "$release_dir/$file_name"
temporary_apk=""
install -m 0644 "$manifest_path" "$temporary_manifest"
chown 1000:1000 "$temporary_manifest"
mv "$temporary_manifest" "$release_dir/release.json"
temporary_manifest=""
rm -f "$archive_path"

printf 'Published Android release: %s\n' "$release_dir/$file_name"
