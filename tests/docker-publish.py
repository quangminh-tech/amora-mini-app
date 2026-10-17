"""Exercise the Dockerfile publish step with stale host NuGet assets; no Docker needed."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
sdk = os.environ.get("DOTNET", "dotnet")
env = dict(os.environ)
env["PATH"] = str(Path(sdk).resolve().parent) + os.pathsep + env["PATH"]

with tempfile.TemporaryDirectory(prefix="amora-docker-publish-") as folder:
    stage = Path(folder)
    shutil.copytree(root / "backend", stage / "backend",
                    ignore=shutil.ignore_patterns("bin", "obj", ".env", ".env.*", "uploads"))
    shutil.copytree(root / "database", stage / "database")
    project = "backend/Amora.Api.csproj"
    subprocess.run([sdk, "restore", project], cwd=stage, env=env, check=True)
    assets = stage / "backend/obj/project.assets.json"
    data = json.loads(assets.read_text())
    contents = assets.read_text()
    for package_folder in data["packageFolders"]:
        contents = contents.replace(package_folder, "/missing-host-nuget/packages/")
    assets.write_text(contents)
    broken = subprocess.run([sdk, "publish", project, "-c", "Release", "--no-restore"],
                            cwd=stage, env=env, capture_output=True, text=True)
    assert broken.returncode != 0 and "NETSDK1064" in broken.stdout + broken.stderr, broken.stdout + broken.stderr
    print("PASS: stale host assets reproduce NETSDK1064", flush=True)
    dockerfile = (root / "backend/Dockerfile").read_text().replace("\\\n", " ")
    commands = [line[4:] for line in dockerfile.splitlines() if line.startswith("RUN ")]
    publish = next(command for command in commands if "dotnet publish" in command)
    # Use the Dockerfile's actual build instruction, with a temporary output path.
    publish = publish.replace("-o /out", "-o " + str(stage / "out"))
    subprocess.run(["sh", "-c", publish], cwd=stage, env=env, check=True)
    assert (stage / "out/Amora.Api.dll").is_file()
    assert (stage / "out/Migrations/001_initial.sql").is_file()
    assert (stage / "out/Migrations/002_ctv_workspace.sql").is_file()
    assert (stage / "out/Migrations/003_catalogue_workspace.sql").is_file()
    print("PASS: Dockerfile cleanup, restore, publish and SQL content", flush=True)
