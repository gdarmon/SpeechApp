#!/usr/bin/env python3
"""One-time GitHub setup. Secrets travel through stdin, never arguments or logs."""
import argparse
import base64
import json
from pathlib import Path
import shlex
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description="Connect the existing Fala upload key and Google publishing service account to GitHub.")
    parser.add_argument("service_account", type=Path, help="Path to the downloaded Google publishing service-account JSON key")
    parser.add_argument("--gh", default="gh", help="GitHub CLI executable; authenticate with gh auth login first")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    gh = shutil.which(args.gh)
    if not gh:
        raise ValueError("Install GitHub CLI and run gh auth login, then rerun this setup.")
    if subprocess.run([gh, "auth", "status"], capture_output=True).returncode:
        raise ValueError("Sign in using gh auth login, then rerun this setup.")
    account = json.loads(args.service_account.read_text())
    if account.get("type") != "service_account" or not account.get("private_key") or not account.get("client_email", "").endswith(".gserviceaccount.com"):
        raise ValueError("Choose a Google service-account JSON key, not an OAuth client file.")
    values = {}
    for line in (root / "artifacts/fala-signing.env").read_text().splitlines():
        if line.strip() and not line.lstrip().startswith("#"):
            name, value = line.split("=", 1)
            values[name] = shlex.split(value)[0]
    secrets = {name: values[name] for name in ["FALA_UPLOAD_STORE_PASSWORD", "FALA_UPLOAD_KEY_ALIAS", "FALA_UPLOAD_KEY_PASSWORD"]}
    secrets["FALA_UPLOAD_KEYSTORE_BASE64"] = base64.b64encode(Path(values["FALA_UPLOAD_KEYSTORE"]).read_bytes()).decode()
    secrets["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"] = json.dumps(account)
    def configure(kind, name, value):
        result = subprocess.run([gh, kind, "set", name, "--repo", "gdarmon/SpeechApp"], input=value.encode(), capture_output=True)
        if result.returncode:
            raise ValueError(f"GitHub could not set {name}. Check your repository permissions; automatic publishing remains disabled.")
    # Enable only after all secrets are in place. Interrupted setup leaves uploads disabled.
    configure("variable", "FALA_PLAY_UPLOAD_ENABLED", "false")
    for name, value in secrets.items():
        configure("secret", name, value)
    configure("variable", "FALA_PLAY_RELEASE_STATUS", "completed")
    configure("variable", "FALA_PLAY_UPLOAD_ENABLED", "true")
    print("GitHub publishing credentials are installed. Automatic INTERNAL testing uploads are enabled after successful main checks.")
    print("No build was uploaded by this setup. The first Play Console release must already exist.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, IndexError):
        # Never print exception text containing contents of a malformed credential file.
        print("Setup could not complete. Check gh auth login, the service-account file, and artifacts/fala-signing.env. No secret values were printed.", file=sys.stderr)
        sys.exit(1)
